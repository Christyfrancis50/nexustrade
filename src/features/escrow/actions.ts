'use server'

import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/db'
import * as schema from '@/db/schema'
import { env } from '@/env'
import { requireRole } from '@/lib/auth/session'
import { toMinor, type Currency } from '@/lib/money'
import { getStripe, rateFor } from '@/features/payments/stripe'
import { getLimiter, tooMany } from '@/lib/rate-limit'
import { EscrowError, fundEscrow, markDelivered, releaseMilestone } from './service'

export type EscrowActionState = { ok?: boolean; message?: string }

const ids = (formData: FormData, key: string) => z.uuid().safeParse(formData.get(key))

function refresh() {
  revalidatePath('/workspace/finance')
  revalidatePath('/workspace/coordinator', 'layout')
  revalidatePath('/workspace/broker')
}

async function safely(fn: () => Promise<string>): Promise<EscrowActionState> {
  try {
    const message = await fn()
    refresh()
    return { ok: true, message }
  } catch (e) {
    if (e instanceof EscrowError) return { ok: false, message: e.message }
    console.error('escrow action failed', e)
    return { ok: false, message: 'Something went wrong. Please try again.' }
  }
}

/** Finance starts a Stripe TEST checkout for the full freight. Stripe's webhook funds escrow. */
export async function startCheckoutAction(_prev: EscrowActionState, formData: FormData): Promise<EscrowActionState> {
  const user = await requireRole('finance')
  const limited = await (await getLimiter('checkout')).limit(user.id)
  if (!limited.success) return { ok: false, message: tooMany(limited) }
  const id = ids(formData, 'shipmentId')
  if (!id.success) return { ok: false, message: 'Unknown shipment' }
  const stripe = getStripe()
  if (!stripe) return { ok: false, message: 'Stripe is not configured. Use "Simulate test payment" instead.' }

  const [s] = await db().select().from(schema.shipments).where(eq(schema.shipments.id, id.data))
  if (!s || s.status !== 'DRAFT') return { ok: false, message: 'Only draft shipments can be booked' }

  const minor = toMinor(s.freightAmount)
  if (minor <= 0n || minor > 99_999_999n) return { ok: false, message: 'Amount is outside what Stripe Checkout accepts' } // Stripe max: 8 digits

  const h = await headers()
  const origin = h.get('origin') ?? `http://${h.get('host') ?? 'localhost:3000'}`
  let url: string | null
  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: s.freightCurrency.toLowerCase(),
              unit_amount: Number(minor), // integer minor units, bounded above: exact as a JS number
              product_data: { name: `Freight escrow · ${s.trackingNumber}`, description: `${s.originPort} → ${s.destinationPort} · ${s.carrierName}` },
            },
          },
        ],
        metadata: { shipmentId: s.id },
        payment_intent_data: { metadata: { shipmentId: s.id } },
        success_url: `${origin}/workspace/finance?paid=${encodeURIComponent(s.trackingNumber)}`,
        cancel_url: `${origin}/workspace/finance?cancelled=${encodeURIComponent(s.trackingNumber)}`,
      },
      // Double-clicks reuse the same session instead of creating a second one.
      { idempotencyKey: `checkout:${s.id}:${s.freightAmount}:${s.freightCurrency}` },
    )
    url = session.url
  } catch (e) {
    console.error('stripe checkout failed', e)
    return { ok: false, message: 'Could not start the Stripe checkout. Check your test keys.' }
  }
  if (!url) return { ok: false, message: 'Stripe did not return a checkout URL' }
  redirect(url)
}

/** Without Stripe keys: record a simulated test payment through the same funding path. */
export async function simulatePaymentAction(_prev: EscrowActionState, formData: FormData): Promise<EscrowActionState> {
  const user = await requireRole('finance')
  if (env.STRIPE_SECRET_KEY) return { ok: false, message: 'Stripe is configured: use the Stripe test checkout.' }
  const id = ids(formData, 'shipmentId')
  if (!id.success) return { ok: false, message: 'Unknown shipment' }
  return safely(async () => {
    const [s] = await db().select().from(schema.shipments).where(eq(schema.shipments.id, id.data))
    if (!s) throw new EscrowError('Shipment not found')
    const r = await fundEscrow(
      db(),
      { shipmentId: s.id, amount: toMinor(s.freightAmount), currency: s.freightCurrency as Currency, reference: `simulated:${randomUUID()}`, actorId: user.id },
      { rateFor },
    )
    return r.status === 'FUNDED' ? `Escrow funded (simulated). ${s.trackingNumber} is booked and in transit.` : 'Already funded.'
  })
}

export async function releaseMilestoneAction(_prev: EscrowActionState, formData: FormData): Promise<EscrowActionState> {
  const user = await requireRole('finance')
  const id = ids(formData, 'milestoneId')
  if (!id.success) return { ok: false, message: 'Unknown milestone' }
  return safely(async () => {
    const r = await releaseMilestone(db(), { milestoneId: id.data, actorId: user.id })
    return r.status === 'RELEASED' ? `Released ${r.amount} ${r.currency} and paid the carrier.` : 'Already released.'
  })
}

export async function markDeliveredAction(_prev: EscrowActionState, formData: FormData): Promise<EscrowActionState> {
  const user = await requireRole('coordinator')
  const id = ids(formData, 'shipmentId')
  if (!id.success) return { ok: false, message: 'Unknown shipment' }
  return safely(async () => {
    await markDelivered(db(), { shipmentId: id.data, actorId: user.id })
    return 'Marked delivered. Finance can now release the remaining escrow.'
  })
}
