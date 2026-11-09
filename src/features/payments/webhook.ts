import type Stripe from 'stripe'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import * as schema from '@/db/schema'
import type { Currency } from '@/lib/money'
import { EscrowError, fundEscrow, type RateFor } from '@/features/escrow/service'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export type WebhookOutcome =
  | { handled: false; reason: string }
  | { handled: true; result: 'FUNDED' | 'ALREADY_FUNDED' }
  | { handled: true; result: 'REJECTED'; reason: string }

const sessionSchema = z.object({
  id: z.string().startsWith('cs_'),
  payment_status: z.string(),
  amount_total: z.number().int().positive(),
  currency: z.enum(['aed', 'usd', 'eur', 'gbp']),
  livemode: z.boolean(),
  metadata: z.object({ shipmentId: z.uuid() }),
})

/**
 * Turn a VERIFIED Stripe event into an escrow funding. Safe against Stripe's
 * at-least-once delivery: funding is idempotent per checkout session.
 * - Unrelated events are acknowledged and ignored.
 * - Live-mode events are refused outright (this app is test-mode only).
 * - Business mismatches (wrong amount) are recorded and acknowledged, so
 *   Stripe doesn't retry forever; infrastructure errors throw → HTTP 500 → retry.
 */
export async function handleStripeEvent(db: Db, event: Stripe.Event, deps: { rateFor: RateFor }): Promise<WebhookOutcome> {
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded')
    return { handled: false, reason: `ignored ${event.type}` }

  const parsed = sessionSchema.safeParse(event.data.object)
  if (!parsed.success) return { handled: false, reason: 'not a NexusTrade escrow session' }
  const session = parsed.data
  if (session.livemode) return { handled: true, result: 'REJECTED', reason: 'live-mode payments are not accepted' }
  if (session.payment_status !== 'paid') return { handled: false, reason: `payment ${session.payment_status}` }

  try {
    const r = await fundEscrow(
      db,
      {
        shipmentId: session.metadata.shipmentId,
        amount: BigInt(session.amount_total),
        currency: session.currency.toUpperCase() as Currency,
        reference: `stripe:${session.id}`,
      },
      deps,
    )
    return { handled: true, result: r.status }
  } catch (e) {
    if (!(e instanceof EscrowError)) throw e
    await db.insert(schema.auditLog).values({
      action: 'escrow.payment_rejected',
      entity: 'shipment',
      entityId: session.metadata.shipmentId,
      data: { session: session.id, reason: e.message },
    })
    return { handled: true, result: 'REJECTED', reason: e.message }
  }
}
