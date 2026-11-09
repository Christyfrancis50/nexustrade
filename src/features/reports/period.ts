import { z } from 'zod'

const day = z.iso.date()

/**
 * Reporting period from ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive `to`).
 * Defaults to the last 12 months. Returns [from, toExclusive) in UTC.
 */
export function parsePeriod(params: { from?: string | null; to?: string | null }, now = new Date()) {
  const fallbackFrom = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()))
  const from = day.safeParse(params.from).success ? new Date(`${params.from}T00:00:00Z`) : fallbackFrom
  const toIncl = day.safeParse(params.to).success ? new Date(`${params.to}T00:00:00Z`) : now
  const toExclusive = new Date(Date.UTC(toIncl.getUTCFullYear(), toIncl.getUTCMonth(), toIncl.getUTCDate() + 1))
  if (from >= toExclusive) throw new RangeError('The start date must be on or before the end date')
  if (toExclusive.getTime() - from.getTime() > 5 * 366 * 86_400_000) throw new RangeError('Choose a period of 5 years or less')
  return { from, toExclusive, label: { from: from.toISOString().slice(0, 10), to: toIncl.toISOString().slice(0, 10) } }
}
