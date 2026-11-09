/**
 * Sliding-window rate limiting. Uses Upstash Redis (free tier) when configured,
 * so limits hold across serverless instances; otherwise an in-memory window
 * that protects a single instance (fine for local dev and demos).
 */
export type LimitResult = { success: boolean; remaining: number; retryAfterSeconds: number }
export interface Limiter {
  limit(key: string): Promise<LimitResult>
}

export type Rule = { requests: number; windowSeconds: number }

/** Policies per action. Keys are built from user id or client IP plus the subject. */
export const RULES = {
  signIn: { requests: 5, windowSeconds: 600 }, // per IP + email
  signInIp: { requests: 20, windowSeconds: 600 }, // per IP, any email
  upload: { requests: 20, windowSeconds: 600 }, // per user: each upload may call the AI
  export: { requests: 30, windowSeconds: 600 }, // per user
  checkout: { requests: 10, windowSeconds: 600 }, // per user
} as const satisfies Record<string, Rule>

export function memoryLimiter(rule: Rule, now: () => number = Date.now): Limiter {
  const hits = new Map<string, number[]>()
  return {
    async limit(key) {
      const t = now()
      const windowStart = t - rule.windowSeconds * 1000
      const recent = (hits.get(key) ?? []).filter((x) => x > windowStart)
      if (recent.length >= rule.requests) {
        hits.set(key, recent)
        return { success: false, remaining: 0, retryAfterSeconds: Math.ceil((recent[0]! + rule.windowSeconds * 1000 - t) / 1000) }
      }
      recent.push(t)
      hits.set(key, recent)
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.every((x) => x <= windowStart)) hits.delete(k) // bound memory
      return { success: true, remaining: rule.requests - recent.length, retryAfterSeconds: 0 }
    },
  }
}

const limiters = new Map<string, Promise<Limiter>>()

export function getLimiter(name: keyof typeof RULES): Promise<Limiter> {
  let l = limiters.get(name)
  if (!l) {
    l = (async (): Promise<Limiter> => {
      const rule = RULES[name]
      const url = process.env.UPSTASH_REDIS_REST_URL
      const token = process.env.UPSTASH_REDIS_REST_TOKEN
      if (!url || !token) return memoryLimiter(rule)
      const [{ Ratelimit }, { Redis }] = await Promise.all([import('@upstash/ratelimit'), import('@upstash/redis')])
      const rl = new Ratelimit({
        redis: new Redis({ url, token }),
        limiter: Ratelimit.slidingWindow(rule.requests, `${rule.windowSeconds} s`),
        prefix: `nexustrade:${name}`,
      })
      return {
        async limit(key) {
          const r = await rl.limit(key)
          return { success: r.success, remaining: r.remaining, retryAfterSeconds: Math.max(0, Math.ceil((r.reset - Date.now()) / 1000)) }
        },
      }
    })()
    limiters.set(name, l)
  }
  return l
}

/** Best-effort client IP from proxy headers (Vercel/Cloudflare set these). */
export function clientIp(h: Headers): string {
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
}

export const tooMany = (r: LimitResult) => `Too many attempts. Please try again in ${Math.max(1, Math.ceil(r.retryAfterSeconds / 60))} minute${r.retryAfterSeconds > 60 ? 's' : ''}.`
