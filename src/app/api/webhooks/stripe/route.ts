import { NextResponse } from 'next/server'
import { env } from '@/env'
import { db } from '@/db'
import { getStripe, rateFor } from '@/features/payments/stripe'
import { handleStripeEvent } from '@/features/payments/webhook'

/**
 * Stripe → NexusTrade. The signature is verified against the RAW body before
 * anything is trusted. Local testing:
 *   stripe listen --forward-to localhost:3000/api/webhooks/stripe
 */
export async function POST(req: Request) {
  const stripe = getStripe()
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) return NextResponse.json({ error: 'Payments not configured' }, { status: 503 })

  const signature = req.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  const body = await req.text()
  let event
  try {
    event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    const outcome = await handleStripeEvent(db(), event, { rateFor })
    return NextResponse.json({ received: true, ...outcome })
  } catch (e) {
    console.error('stripe webhook failed; Stripe will retry', event.id, e)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
