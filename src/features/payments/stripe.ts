import 'server-only'
import Stripe from 'stripe'
import { env } from '@/env'
import { db } from '@/db'
import { getRatesToAed } from '@/lib/fx/service'
import type { Currency } from '@/lib/money'

let client: Stripe | null | undefined

/** Test-mode Stripe client, or null when not configured. env.ts rejects live keys. */
export function getStripe(): Stripe | null {
  if (client !== undefined) return client
  client = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, appInfo: { name: 'NexusTrade' } }) : null
  return client
}

/** Current AED rate from the FX service (cache → ECB feed → fallbacks). */
export async function rateFor(currency: Currency): Promise<string> {
  const { rates } = await getRatesToAed(db())
  return rates[currency]
}
