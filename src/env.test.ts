import { describe, expect, it } from 'vitest'
import { parseEnv } from './env'

describe('env', () => {
  it('runs with no keys at all (mock AI, no payments)', () => {
    const env = parseEnv({})
    expect(env.AI_PROVIDER).toBe('mock')
    expect(env.STRIPE_SECRET_KEY).toBeUndefined()
  })

  it('treats blank values from .env.example as unset', () => {
    expect(parseEnv({ DATABASE_URL: '', STRIPE_SECRET_KEY: '  ' }).DATABASE_URL).toBeUndefined()
  })

  it('rejects live Stripe keys', () => {
    expect(() => parseEnv({ STRIPE_SECRET_KEY: 'sk_live_abc' })).toThrow(/TEST keys/)
  })

  it('accepts Stripe test keys', () => {
    expect(parseEnv({ STRIPE_SECRET_KEY: 'sk_test_abc' }).STRIPE_SECRET_KEY).toBe('sk_test_abc')
  })

  it('requires a key for a real AI provider', () => {
    expect(() => parseEnv({ AI_PROVIDER: 'google' })).toThrow(/GOOGLE_GENERATIVE_AI_API_KEY/)
  })
})
