import { beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '../../../test/pglite'
import * as schema from '@/db/schema'
import { ACCOUNTS } from '@/db/data/demo'
import { accountBalances } from '@/lib/ledger/post'
import { toMinor } from '@/lib/money'
import { ACCOUNT } from '@/lib/ledger/entries'
import { EscrowError, fundEscrow, markDelivered, releaseMilestone } from './service'
import { releaseBlocker } from './rules'

let t: TestDb
let shipmentId: string
const rateFor = async (c: string) => ({ AED: '1', USD: '3.6725', EUR: '4.015', GBP: '4.73' })[c]!
const milestone = async (kind: 'BOOKING' | 'CUSTOMS_CLEARED' | 'DELIVERED') =>
  (await t.db.select().from(schema.escrowMilestones).where(and(eq(schema.escrowMilestones.shipmentId, shipmentId), eq(schema.escrowMilestones.kind, kind))))[0]!
const setStatus = (status: 'CLEARED' | 'DELIVERED') => t.db.update(schema.shipments).set({ status }).where(eq(schema.shipments.id, shipmentId))
const balance = async (code: string) => (await accountBalances(t.db)).find((a) => a.code === code)!.balanceAed

beforeAll(async () => {
  t = await createTestDb()
  await t.db.insert(schema.accounts).values([...ACCOUNTS])
  const [s] = await t.db
    .insert(schema.shipments)
    .values({ trackingNumber: 'ESC-1', mode: 'SEA', shipperName: 'A', consigneeName: 'B', carrierName: 'Oceanic Lines', originPort: 'CNSHA', destinationPort: 'AEJEA', freightAmount: '4800.00', freightCurrency: 'USD' })
    .returning()
  shipmentId = s!.id
  await t.db.insert(schema.escrowMilestones).values([
    { shipmentId, kind: 'BOOKING', percentBp: 1000, amount: '480.00', currency: 'USD' },
    { shipmentId, kind: 'CUSTOMS_CLEARED', percentBp: 4000, amount: '1920.00', currency: 'USD' },
    { shipmentId, kind: 'DELIVERED', percentBp: 5000, amount: '2400.00', currency: 'USD' },
  ])
}, 60_000)

describe('releaseBlocker', () => {
  it('follows the 10/40/50 release policy', () => {
    expect(releaseBlocker({ kind: 'CUSTOMS_CLEARED', status: 'PENDING' }, 'CLEARED', false)).toMatch(/not been funded/)
    expect(releaseBlocker({ kind: 'CUSTOMS_CLEARED', status: 'PENDING' }, 'IN_TRANSIT', true)).toMatch(/customs clearance/)
    expect(releaseBlocker({ kind: 'CUSTOMS_CLEARED', status: 'PENDING' }, 'CLEARED', true)).toBeNull()
    expect(releaseBlocker({ kind: 'DELIVERED', status: 'PENDING' }, 'CLEARED', true)).toMatch(/proof of delivery/)
    expect(releaseBlocker({ kind: 'BOOKING', status: 'LOCKED' }, 'DELIVERED', true)).toBeNull()
    expect(releaseBlocker({ kind: 'BOOKING', status: 'RELEASED' }, 'DELIVERED', true)).toMatch(/Already/)
  })
})

describe('escrow lifecycle', () => {
  it('refuses a payment that does not match the freight', async () => {
    await expect(fundEscrow(t.db, { shipmentId, amount: toMinor('4799.99'), currency: 'USD', reference: 'test:pay:bad' }, { rateFor })).rejects.toThrow(/does not match/)
    await expect(fundEscrow(t.db, { shipmentId, amount: toMinor('4800.00'), currency: 'EUR', reference: 'test:pay:bad2' }, { rateFor })).rejects.toThrow(/does not match/)
  })

  it('cannot release anything before funding', async () => {
    await expect(releaseMilestone(t.db, { milestoneId: (await milestone('CUSTOMS_CLEARED')).id, actorId: null })).rejects.toThrow(/not been funded/)
  })

  it('funds escrow once, locks the deposit and books the shipment', async () => {
    const first = await fundEscrow(t.db, { shipmentId, amount: toMinor('4800.00'), currency: 'USD', reference: 'stripe:cs_test_1' }, { rateFor })
    expect(first.status).toBe('FUNDED')
    const again = await fundEscrow(t.db, { shipmentId, amount: toMinor('4800.00'), currency: 'USD', reference: 'stripe:cs_test_1' }, { rateFor })
    expect(again.status).toBe('ALREADY_FUNDED')
    expect((await milestone('BOOKING')).status).toBe('LOCKED')
    expect((await t.db.select().from(schema.shipments).where(eq(schema.shipments.id, shipmentId)))[0]!.status).toBe('IN_TRANSIT')
    expect(await balance(ACCOUNT.ESCROW)).toBe(toMinor('17628.00')) // 4800 × 3.6725
  })

  it('releases 40% only after customs clears, and is idempotent', async () => {
    const m = await milestone('CUSTOMS_CLEARED')
    await expect(releaseMilestone(t.db, { milestoneId: m.id, actorId: null })).rejects.toBeInstanceOf(EscrowError)
    await setStatus('CLEARED')
    expect(await releaseMilestone(t.db, { milestoneId: m.id, actorId: null })).toMatchObject({ status: 'RELEASED', amount: '1920.00' })
    expect(await releaseMilestone(t.db, { milestoneId: m.id, actorId: null })).toMatchObject({ status: 'ALREADY_RELEASED' })
    expect(await t.db.$count(schema.payouts)).toBe(1)
  })

  it('delivery needs a proof-of-delivery document', async () => {
    await expect(markDelivered(t.db, { shipmentId, actorId: null })).rejects.toThrow(/proof of delivery/)
    await t.db.insert(schema.documents).values({ shipmentId, type: 'PROOF_OF_DELIVERY', storagePath: 'x/pod.jpg', originalFilename: 'pod.jpg', mimeType: 'image/jpeg', sizeBytes: 100, sha256: 'a'.repeat(64) })
    await markDelivered(t.db, { shipmentId, actorId: null })
    await expect(markDelivered(t.db, { shipmentId, actorId: null })).rejects.toThrow(/cleared by customs/)
  })

  it('after delivery the deposit and final 50% release, and escrow nets to exactly zero', async () => {
    await releaseMilestone(t.db, { milestoneId: (await milestone('BOOKING')).id, actorId: null })
    await releaseMilestone(t.db, { milestoneId: (await milestone('DELIVERED')).id, actorId: null })
    expect(await balance(ACCOUNT.ESCROW)).toBe(0n)
    expect(await balance(ACCOUNT.CARRIER_PAYABLE)).toBe(0n) // every release was paid out
    expect(await balance(ACCOUNT.CASH)).toBe(0n) // 4800 in, 4800 out to the carrier
    expect(await t.db.$count(schema.payouts)).toBe(3)
    expect(await t.db.$count(schema.auditLog)).toBeGreaterThanOrEqual(5)
  })

  it('posts with the funding rate even if FX moves later', async () => {
    const rates = await t.db.select({ rate: schema.ledgerEntries.fxRateToAed }).from(schema.ledgerEntries)
    expect(new Set(rates.map((r) => r.rate))).toEqual(new Set(['3.67250000']))
  })
})
