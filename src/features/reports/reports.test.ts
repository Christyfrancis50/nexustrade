import { beforeAll, describe, expect, it } from 'vitest'
import { csvCell, toCsv } from '@/lib/csv'
import { createTestDb, type TestDb } from '../../../test/pglite'
import { seed } from '@/db/seed'
import { assertJournalsBalance, journalCsv, monthlySpend, vatCsv, vatSummary, xeroJournalCsv, type InvoiceRow, type JournalLine } from './build'
import { fundedFreight, invoiceRows, journalLines } from './data'

describe('csv', () => {
  it('escapes quotes, commas and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
    expect(csvCell(null)).toBe('')
  })

  it('neutralises spreadsheet formula injection but keeps negative numbers', () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`)
    expect(csvCell('+1+1')).toBe("'+1+1")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell('-12.50')).toBe('-12.50')
    expect(csvCell('-cmd')).toBe("'-cmd")
  })

  it('uses CRLF line endings', () => {
    expect(toCsv([{ a: 1 }], [{ header: 'A', value: (r) => r.a }])).toBe('A\r\n1\r\n')
  })
})

const line = (tx: string, direction: 'DEBIT' | 'CREDIT', amountAed: string, accountCode = '1000'): JournalLine => ({
  transactionId: tx,
  postedAt: new Date('2026-10-05T10:00:00Z'),
  description: 'Escrow funded · NXT-1',
  reference: `ref:${tx}`,
  accountCode,
  accountName: accountCode === '1000' ? 'Cash (Stripe)' : 'Escrow Holding',
  direction,
  amountAed,
})

describe('journal exports', () => {
  const lines = [line('t1', 'CREDIT', '100.00', '2100'), line('t1', 'DEBIT', '100.00', '1000')]

  it('refuses to export an unbalanced journal', () => {
    expect(() => assertJournalsBalance([line('t2', 'DEBIT', '1.00')])).toThrow(/does not balance/)
  })

  it('generic journal puts debits first with Debit/Credit columns', () => {
    const csv = journalCsv(lines).split('\r\n')
    expect(csv[0]).toBe('Journal Date,Reference Number,Notes,Currency,Account Code,Account,Debit,Credit')
    expect(csv[1]).toBe('2026-10-05,ref:t1,Escrow funded · NXT-1,AED,1000,Cash (Stripe),100.00,')
    expect(csv[2]).toBe('2026-10-05,ref:t1,Escrow funded · NXT-1,AED,2100,Escrow Holding,,100.00')
  })

  it('Xero journal uses signed amounts that net to zero', () => {
    const rows = xeroJournalCsv(lines).trim().split('\r\n').slice(1)
    const amounts = rows.map((r) => Number(r.split(',').at(-1)))
    expect(amounts).toEqual([100, -100])
  })
})

const inv = (over: Partial<InvoiceRow>): InvoiceRow => ({
  invoiceNumber: 'INV-1',
  issuedAt: new Date('2026-10-10T00:00:00Z'),
  trackingNumber: 'NXT-1',
  consigneeName: 'Gulf LLC',
  consigneeTrn: '100234567800003',
  taxTreatment: 'STANDARD',
  currency: 'USD',
  fxRateToAed: '3.67250000',
  subtotal: '1000.00',
  dutyAmount: '50.00',
  vatAmount: '52.50',
  total: '1102.50',
  totalAed: '4048.93',
  ...over,
})

describe('VAT summary', () => {
  it('splits standard, zero-rated and exempt supplies in AED', () => {
    const s = vatSummary(
      [inv({}), inv({ invoiceNumber: 'INV-2', taxTreatment: 'EXEMPT', vatAmount: '0.00', total: '1050.00' }), inv({ invoiceNumber: 'INV-3', taxTreatment: 'ZERO_RATED', currency: 'AED', fxRateToAed: '1', subtotal: '500.00', dutyAmount: '0.00', vatAmount: '0.00', total: '500.00' })],
      new Date('2026-10-01'),
      new Date('2026-11-01'),
    )
    expect(s.standardRated).toEqual({ taxableAed: 385613n, vatAed: 19281n, count: 1 }) // 1050 and 52.50 USD at 3.6725
    expect(s.exempt).toEqual({ valueAed: 385613n, count: 1 })
    expect(s.zeroRated).toEqual({ valueAed: 50000n, count: 1 })
    expect(s.issues).toEqual([])
  })

  it('flags wrong VAT, missing TRNs and VAT on exempt supplies', () => {
    const s = vatSummary(
      [inv({ vatAmount: '50.00' }), inv({ invoiceNumber: 'INV-9', consigneeTrn: null }), inv({ invoiceNumber: 'INV-X', taxTreatment: 'EXEMPT' })],
      new Date('2026-10-01'),
      new Date('2026-11-01'),
    )
    expect(s.issues).toEqual([
      'INV-1: VAT 50.00 is not 5% of 1050.00 (expected 52.50)',
      'INV-9: standard-rated invoice without a customer TRN',
      'INV-X: exempt invoice charges VAT',
    ])
  })

  it('CSV lists invoices oldest first', () => {
    const csv = vatCsv([inv({ invoiceNumber: 'B', issuedAt: new Date('2026-10-20') }), inv({ invoiceNumber: 'A' })])
    expect(csv.split('\r\n')[1]!.startsWith('A,')).toBe(true)
  })
})

describe('monthlySpend', () => {
  it('fills empty months and sums AED', () => {
    const now = new Date('2026-11-15T00:00:00Z')
    expect(
      monthlySpend(
        [
          { at: new Date('2026-11-02T00:00:00Z'), amountAed: '100.50' },
          { at: new Date('2026-11-20T00:00:00Z'), amountAed: '0.50' },
          { at: new Date('2026-09-01T00:00:00Z'), amountAed: '10.00' },
          { at: new Date('2025-01-01T00:00:00Z'), amountAed: '999.00' }, // outside window
        ],
        3,
        now,
      ),
    ).toEqual([
      { month: '2026-09', aed: 10 },
      { month: '2026-10', aed: 0 },
      { month: '2026-11', aed: 101 },
    ])
  })
})

describe('exports from the seeded ledger', () => {
  let t: TestDb
  beforeAll(async () => {
    t = await createTestDb()
    await seed(t.db)
  }, 120_000)

  const all = [new Date('2000-01-01'), new Date('2100-01-01')] as const

  it('every exported journal balances and both formats are produced', async () => {
    const lines = await journalLines(t.db, ...all)
    expect(lines.length).toBeGreaterThan(40)
    expect(() => assertJournalsBalance(lines)).not.toThrow()
    expect(journalCsv(lines).split('\r\n').length).toBe(lines.length + 2)
    const xero = xeroJournalCsv(lines).trim().split('\r\n').slice(1)
    const total = xero.reduce((s, r) => s + Math.round(Number(r.split(',').at(-1)) * 100), 0)
    expect(total).toBe(0)
  })

  it('the seeded invoices pass the VAT checks', async () => {
    const s = vatSummary(await invoiceRows(t.db, ...all), ...all)
    expect(s.standardRated.count + s.exempt.count + s.zeroRated.count).toBe(3)
    expect(s.issues).toEqual([])
  })

  it('funded freight feeds the spend chart', async () => {
    const rows = await fundedFreight(t.db, all[0])
    expect(rows).toHaveLength(5)
  })
})
