import { createHash } from 'node:crypto'

/**
 * Idempotency-Key rules: clients send a UUID; internal jobs may use a
 * namespaced key such as `seed:ledger:NXT-DEMO-0004:fund`.
 */
const KEY = /^[A-Za-z0-9][A-Za-z0-9:_.\-]{7,127}$/

export class IdempotencyError extends Error {
  override name = 'IdempotencyError'
}

export function assertIdempotencyKey(key: string): void {
  if (!KEY.test(key)) throw new IdempotencyError('Idempotency-Key must be 8–128 characters of letters, digits, ":", "_", "." or "-"')
}

/** Stable JSON: sorted object keys, bigints as strings, so equal requests hash equally. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => {
    if (typeof v === 'bigint') return v.toString()
    if (v && typeof v === 'object' && !Array.isArray(v))
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    return v
  })
}

export function requestHash(scope: string, payload: unknown): string {
  return createHash('sha256').update(`${scope}\n${canonicalJson(payload)}`).digest('hex')
}
