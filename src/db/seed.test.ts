import { beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from '../../test/pglite'
import { seed } from './seed'
import { toMinor } from '../lib/money'

let t: TestDb
let finance: string

beforeAll(async () => {
  t = await createTestDb()
  await t.createUser('coordinator@nexustrade.test', 'coordinator')
  finance = await t.createUser('finance@nexustrade.test', 'finance')
}, 60_000)

const q = async <T>(sql: string) => (await t.pg.query<T>(sql)).rows

describe('seed', () => {
  it('loads reference data and one shipment per status', async () => {
    const summary = await seed(t.db)
    expect(summary).toMatchObject({ shipments: 6, demoUsersLinked: 2 })
    const statuses = await q<{ status: string }>(`SELECT DISTINCT status FROM shipments ORDER BY status`)
    // Enums sort in declaration order, i.e. the shipment lifecycle.
    expect(statuses.map((s) => s.status)).toEqual(['DRAFT', 'IN_TRANSIT', 'CUSTOMS_HOLD', 'CLEARED', 'DELIVERED'])
  })

  it('is safe to run twice', async () => {
    await seed(t.db)
    expect(await q(`SELECT 1 FROM shipments`)).toHaveLength(6)
    expect(await q(`SELECT 1 FROM fx_rates`)).toHaveLength(4)
  })

  it('splits escrow 10/40/50 and the parts sum exactly to the freight', async () => {
    const rows = await q<{ tracking_number: string; freight_amount: string; total: string; n: number }>(`
      SELECT s.tracking_number, s.freight_amount, sum(e.amount)::numeric(14,2)::text AS total, count(*)::int AS n
      FROM shipments s JOIN escrow_milestones e ON e.shipment_id = s.id GROUP BY s.id`)
    for (const r of rows) {
      expect(r.n).toBe(3)
      expect(toMinor(r.total)).toBe(toMinor(r.freight_amount))
    }
  })

  it('invoices only cleared/delivered shipments, with VAT matching the tax treatment', async () => {
    const rows = await q<{ status: string; tax_treatment: string; vat_rate_bp: number; vat_amount: string }>(`
      SELECT s.status, i.tax_treatment, i.vat_rate_bp, i.vat_amount FROM invoices i JOIN shipments s ON s.id = i.shipment_id`)
    expect(rows).toHaveLength(3)
    for (const r of rows) {
      expect(['CLEARED', 'DELIVERED']).toContain(r.status)
      if (r.tax_treatment === 'STANDARD') expect(r.vat_rate_bp).toBe(500)
      else expect(r.vat_amount).toBe('0.00')
    }
  })

  it('flags the document discrepancy on the shipment held at customs', async () => {
    const rows = await q<{ status: string }>(`
      SELECT s.status FROM documents d JOIN shipments s ON s.id = d.shipment_id WHERE d.has_discrepancy`)
    expect(rows).toEqual([{ status: 'CUSTOMS_HOLD' }])
  })

  it('every classified line item references a known HS code', async () => {
    const orphans = await q(`SELECT 1 FROM line_items l LEFT JOIN hs_codes h ON h.code = l.hs_code WHERE l.hs_code IS NOT NULL AND h.code IS NULL`)
    expect(orphans).toHaveLength(0)
  })

  it('posts ledger history through the engine: funding, invoices, releases and payouts', async () => {
    // 5 booked shipments funded + 3 invoices + 7 released milestones + 7 payouts
    expect(await q(`SELECT 1 FROM ledger_transactions`)).toHaveLength(22)
    expect(await q(`SELECT 1 FROM payouts`)).toHaveLength(7)
    const unlinked = await q(`SELECT 1 FROM escrow_milestones WHERE status = 'RELEASED' AND ledger_transaction_id IS NULL`)
    expect(unlinked).toHaveLength(0)
  })

  it('the books balance and escrow holds exactly the unreleased funded milestones', async () => {
    const [tb] = await q<{ debit: string; credit: string }>(`
      SELECT sum(amount_aed) FILTER (WHERE direction = 'DEBIT')::text AS debit,
             sum(amount_aed) FILTER (WHERE direction = 'CREDIT')::text AS credit FROM ledger_entries`)
    expect(tb!.debit).toBe(tb!.credit)

    const [escrow] = await q<{ balance_aed: string }>(`SELECT balance_aed::text FROM account_balances WHERE code = '2100'`)
    const [held] = await q<{ aed: string }>(`
      SELECT coalesce(sum(round(e.amount * f.rate_to_aed, 2)), 0)::numeric(14,2)::text AS aed
      FROM escrow_milestones e
      JOIN shipments s ON s.id = e.shipment_id
      JOIN fx_rates f ON f.currency = e.currency
      WHERE e.status <> 'RELEASED' AND s.status <> 'DRAFT'`)
    // Per-line rounding can differ by a few fils from rounding the sum.
    expect(Math.abs(Number(escrow!.balance_aed) - Number(held!.aed))).toBeLessThan(0.05)
    expect(Number(escrow!.balance_aed)).toBeGreaterThan(0)
  })

  it('a re-run skips existing demo shipments instead of duplicating ledger history', async () => {
    const again = await seed(t.db)
    expect(again).toMatchObject({ skipped: true, shipments: 6, ledgerTransactions: 22 })
  })

  it('finance can read invoices through RLS; the seed data is visible to the right roles', async () => {
    const n = await t.asUser(finance, async (db) => (await db.query(`SELECT 1 FROM invoices`)).rows.length)
    expect(n).toBe(3)
  })
})
