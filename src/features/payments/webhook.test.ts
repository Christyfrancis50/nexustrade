import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import Stripe from 'stripe'
import { createTestDb, type TestDb } from '../../../test/pglite'
import * as schema from '@/db/schema'
import { ACCOUNTS } from '@/db/data/demo'
import { handleStripeEvent } from './webhook'

const stripe = new Stripe('sk_test_offline') // never calls the network in these tests
const SECRET = 'whsec_test_secret'
const rateFor = async () => '3.6725'
let t: TestDb
let shipmentId: string

/** Build an event exactly as Stripe would deliver it, signed, then verify it like the route does. */
function signedEvent(object: Record<string, unknown>, type = 'checkout.session.completed', id = 'evt_1') {
  const payload = JSON.stringify({ id, object: 'event', type, livemode: false, data: { object } })
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET })
  return stripe.webhooks.constructEvent(payload, header, SECRET)
}
const session = (over: Record<string, unknown> = {}) => ({
  id: 'cs_test_abc',
  object: 'checkout.session',
  payment_status: 'paid',
  amount_total: 480000,
  currency: 'usd',
  livemode: false,
  metadata: { shipmentId },
  ...over,
})

beforeAll(async () => {
  t = await createTestDb()
  await t.db.insert(schema.accounts).values([...ACCOUNTS])
  const [s] = await t.db
    .insert(schema.shipments)
    .values({ trackingNumber: 'PAY-1', mode: 'SEA', shipperName: 'A', consigneeName: 'B', carrierName: 'C', originPort: 'CNSHA', destinationPort: 'AEJEA', freightAmount: '4800.00', freightCurrency: 'USD' })
    .returning()
  shipmentId = s!.id
  await t.db.insert(schema.escrowMilestones).values([
    { shipmentId, kind: 'BOOKING', percentBp: 1000, amount: '480.00', currency: 'USD' },
    { shipmentId, kind: 'CUSTOMS_CLEARED', percentBp: 4000, amount: '1920.00', currency: 'USD' },
    { shipmentId, kind: 'DELIVERED', percentBp: 5000, amount: '2400.00', currency: 'USD' },
  ])
}, 60_000)

describe('Stripe webhook signature', () => {
  it('rejects tampered payloads', () => {
    const payload = JSON.stringify({ id: 'evt_x', object: 'event', type: 'checkout.session.completed', data: { object: session() } })
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET })
    const tampered = payload.replace('480000', '1')
    expect(() => stripe.webhooks.constructEvent(tampered, header, SECRET)).toThrow()
    expect(() => stripe.webhooks.constructEvent(payload, header, 'whsec_wrong')).toThrow()
  })
})

describe('handleStripeEvent', () => {
  it('ignores unrelated events and sessions without our metadata', async () => {
    expect(await handleStripeEvent(t.db, signedEvent({ id: 'pi_1' }, 'payment_intent.created'), { rateFor })).toMatchObject({ handled: false })
    expect(await handleStripeEvent(t.db, signedEvent(session({ metadata: {} })), { rateFor })).toMatchObject({ handled: false })
  })

  it('waits for unpaid (async) sessions', async () => {
    expect(await handleStripeEvent(t.db, signedEvent(session({ payment_status: 'unpaid' })), { rateFor })).toMatchObject({ handled: false })
  })

  it('refuses live-mode payments', async () => {
    expect(await handleStripeEvent(t.db, signedEvent(session({ livemode: true })), { rateFor })).toMatchObject({ result: 'REJECTED' })
  })

  it('records an amount mismatch without funding, and acknowledges it', async () => {
    const r = await handleStripeEvent(t.db, signedEvent(session({ id: 'cs_test_wrong', amount_total: 100 })), { rateFor })
    expect(r).toMatchObject({ handled: true, result: 'REJECTED' })
    const [log] = await t.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, 'escrow.payment_rejected'))
    expect(log).toBeTruthy()
  })

  it('funds escrow once, even when Stripe delivers the event twice', async () => {
    expect(await handleStripeEvent(t.db, signedEvent(session()), { rateFor })).toEqual({ handled: true, result: 'FUNDED' })
    expect(await handleStripeEvent(t.db, signedEvent(session(), 'checkout.session.completed', 'evt_retry'), { rateFor })).toEqual({ handled: true, result: 'ALREADY_FUNDED' })
    expect(await t.db.$count(schema.ledgerTransactions)).toBe(1)
  })
})
