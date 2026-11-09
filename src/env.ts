import { z } from 'zod'

/**
 * Typed, validated environment. Import `env` instead of reading `process.env`.
 * Most integrations are optional so the app runs locally with zero keys
 * (mock AI extraction, no payments). Each feature checks for its own keys.
 */
const optional = z.string().trim().min(1).optional()

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Database (Supabase Postgres connection string, pooled port 6543 for serverless)
  DATABASE_URL: z.url().optional(),

  // Supabase Auth / Storage
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,

  // AI extraction: `mock` needs no key
  AI_PROVIDER: z.enum(['mock', 'google', 'anthropic']).default('mock'),
  GOOGLE_GENERATIVE_AI_API_KEY: optional,
  ANTHROPIC_API_KEY: optional,

  // Payments: test mode only, enforced here
  STRIPE_SECRET_KEY: z
    .string()
    .startsWith('sk_test_', 'Only Stripe TEST keys (sk_test_…) are allowed in NexusTrade')
    .optional(),
  STRIPE_WEBHOOK_SECRET: optional,

  // Rate limiting (Upstash free tier); falls back to in-memory when absent
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: optional,
})
  .superRefine((e, ctx) => {
    if (e.AI_PROVIDER === 'google' && !e.GOOGLE_GENERATIVE_AI_API_KEY)
      ctx.addIssue({ code: 'custom', path: ['GOOGLE_GENERATIVE_AI_API_KEY'], message: 'Required when AI_PROVIDER=google' })
    if (e.AI_PROVIDER === 'anthropic' && !e.ANTHROPIC_API_KEY)
      ctx.addIssue({ code: 'custom', path: ['ANTHROPIC_API_KEY'], message: 'Required when AI_PROVIDER=anthropic' })
  })

export type Env = z.infer<typeof envSchema>

export function parseEnv(source: Record<string, string | undefined>): Env {
  // Blank values (e.g. copied straight from .env.example) count as unset.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v.trim() !== ''))
  const result = envSchema.safeParse(cleaned)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment variables:\n${issues}`)
  }
  return result.data
}

export const env = parseEnv(process.env)
