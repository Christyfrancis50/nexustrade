import { describe, expect, it } from 'vitest'
import { clientIp, memoryLimiter, tooMany } from './rate-limit'

describe('memoryLimiter', () => {
  it('allows up to the limit, then blocks until the window slides', async () => {
    let now = 1_000_000
    const l = memoryLimiter({ requests: 3, windowSeconds: 60 }, () => now)
    for (let i = 0; i < 3; i++) expect((await l.limit('k')).success).toBe(true)
    const blocked = await l.limit('k')
    expect(blocked).toMatchObject({ success: false, remaining: 0 })
    expect(blocked.retryAfterSeconds).toBe(60)
    now += 61_000
    expect((await l.limit('k')).success).toBe(true)
  })

  it('keeps keys independent', async () => {
    const l = memoryLimiter({ requests: 1, windowSeconds: 60 })
    expect((await l.limit('a')).success).toBe(true)
    expect((await l.limit('b')).success).toBe(true)
    expect((await l.limit('a')).success).toBe(false)
  })
})

describe('helpers', () => {
  it('reads the first forwarded IP', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7')
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2')
    expect(clientIp(new Headers())).toBe('unknown')
  })

  it('formats a friendly retry message', () => {
    expect(tooMany({ success: false, remaining: 0, retryAfterSeconds: 30 })).toBe('Too many attempts. Please try again in 1 minute.')
    expect(tooMany({ success: false, remaining: 0, retryAfterSeconds: 540 })).toBe('Too many attempts. Please try again in 9 minutes.')
  })
})
