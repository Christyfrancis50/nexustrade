import { and, cosineDistance, desc, eq, isNotNull, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import { keywords, type Embedder } from './embedder'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export type Suggestion = {
  code: string
  description: string
  heading: string
  dutyRateBp: number
  restricted: boolean
  /** 0..1. Semantic: cosine similarity. Keyword: share of the line's keywords found. */
  confidence: number
  method: 'semantic' | 'keyword'
}

const clamp = (n: number) => Math.max(0, Math.min(1, Math.round(n * 10_000) / 10_000))

/**
 * Top HS subheadings for a goods description.
 * Uses pgvector cosine similarity when an embedder is configured and codes have
 * embeddings; otherwise Postgres full-text search (weighted: subheading text
 * over heading text), so it works with no AI key at all.
 */
export async function suggestHsCodes(db: Db, description: string, opts: { embedder?: Embedder | null; limit?: number } = {}): Promise<Suggestion[]> {
  const limit = opts.limit ?? 3
  const cols = {
    code: schema.hsCodes.code,
    description: schema.hsCodes.description,
    heading: schema.hsCodes.heading,
    dutyRateBp: schema.hsCodes.dutyRateBp,
    restricted: schema.hsCodes.restricted,
  }

  if (opts.embedder) {
    const embedded = await db.$count(schema.hsCodes, isNotNull(schema.hsCodes.embedding))
    if (embedded > 0) {
      const [vec] = await opts.embedder.embed([description], 'query')
      const distance = cosineDistance(schema.hsCodes.embedding, vec!)
      const rows = await db
        .select({ ...cols, distance })
        .from(schema.hsCodes)
        .where(isNotNull(schema.hsCodes.embedding))
        .orderBy(distance)
        .limit(limit)
      return rows.map(({ distance: d, ...r }) => ({ ...r, confidence: clamp(1 - Number(d)), method: 'semantic' as const }))
    }
  }

  const words = keywords(description)
  if (words.length === 0) return []
  // OR the keywords together; to_tsquery stems them ('pumps' → 'pump').
  const query = sql`to_tsquery('english', ${words.join(' | ')})`
  const coverage = sql<number>`(
    select count(*)::float / ${words.length}
    from unnest(${sql.raw(`array[${words.map((w) => `'${w}'`).join(',')}]`)}::text[]) w
    where ${schema.hsCodes.search} @@ plainto_tsquery('english', w)
  )`
  const rank = sql<number>`ts_rank_cd(${schema.hsCodes.search}, ${query}, 32)`
  const rows = await db
    .select({ ...cols, coverage, rank })
    .from(schema.hsCodes)
    .where(sql`${schema.hsCodes.search} @@ ${query}`)
    // Most of the line's keywords matched first; then term density; then code for stable ties.
    .orderBy(desc(coverage), desc(rank), schema.hsCodes.code)
    .limit(limit)
  return rows.map((r) => ({
    code: r.code,
    description: r.description,
    heading: r.heading,
    dutyRateBp: r.dutyRateBp,
    restricted: r.restricted,
    confidence: clamp(Number(r.coverage)),
    method: 'keyword' as const,
  }))
}

/** Store the top suggestion on every unclassified line (optionally for one shipment). */
export async function suggestForPendingLines(db: Db, opts: { shipmentId?: string; embedder?: Embedder | null } = {}): Promise<number> {
  const pending = await db
    .select({ id: schema.lineItems.id, description: schema.lineItems.description })
    .from(schema.lineItems)
    .where(
      and(
        eq(schema.lineItems.hsStatus, 'UNCLASSIFIED'),
        opts.shipmentId ? eq(schema.lineItems.shipmentId, opts.shipmentId) : undefined,
      ),
    )
  let updated = 0
  for (const line of pending) {
    const [top] = await suggestHsCodes(db, line.description, { embedder: opts.embedder, limit: 1 })
    if (!top) continue
    await db
      .update(schema.lineItems)
      .set({ hsCode: top.code, hsStatus: 'SUGGESTED', hsConfidence: top.confidence.toFixed(4) })
      .where(and(eq(schema.lineItems.id, line.id), eq(schema.lineItems.hsStatus, 'UNCLASSIFIED')))
    updated++
  }
  return updated
}
