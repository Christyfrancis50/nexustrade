/**
 * Fill hs_codes.embedding for semantic HS search (idempotent: only empty rows).
 *   npm run hs:embed
 * Needs DATABASE_URL and GOOGLE_GENERATIVE_AI_API_KEY.
 *
 * Paced for Google's free tier (100 embedding requests per minute, each text
 * counts as one): 90 texts per minute, honours "retry in Ns" replies, and stops
 * cleanly on a daily quota so it can simply be re-run later. ~1 hour for 5,612.
 */
import { eq, isNotNull, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { z } from 'zod'
import * as schema from '../src/db/schema'
import { googleEmbedder } from '../src/features/hs/embedder'

const BATCH = 90
const WINDOW_MS = 62_000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function quotaInfo(e: unknown): { daily: boolean; retryMs: number } | null {
  const text = String((e as { message?: string })?.message ?? e) + JSON.stringify((e as { lastError?: unknown })?.lastError ?? '')
  if (!/RESOURCE_EXHAUSTED|429|quota/i.test(text)) return null
  const daily = /PerDay|per day/i.test(text)
  const m = /retry in ([\d.]+)s/i.exec(text)
  return { daily, retryMs: m ? Math.ceil(Number(m[1]) * 1000) + 2_000 : WINDOW_MS }
}

async function main() {
  const env = z.object({ DATABASE_URL: z.url(), GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1) }).parse(process.env)
  const client = postgres(env.DATABASE_URL, { prepare: false, max: 2 })
  const db = drizzle(client, { schema, casing: 'snake_case' })
  const embedder = await googleEmbedder(env.GOOGLE_GENERATIVE_AI_API_KEY, { maxRetries: 0 })
  const total = await db.$count(schema.hsCodes)
  let done = await db.$count(schema.hsCodes, isNotNull(schema.hsCodes.embedding))

  try {
    for (;;) {
      const batch = await db
        .select({ code: schema.hsCodes.code, description: schema.hsCodes.description, heading: schema.hsCodes.heading })
        .from(schema.hsCodes)
        .where(isNull(schema.hsCodes.embedding))
        .limit(BATCH)
      if (batch.length === 0) break

      const started = Date.now()
      let vectors: number[][] | null = null
      for (let attempt = 1; attempt <= 8 && !vectors; attempt++) {
        try {
          vectors = await embedder.embed(batch.map((r) => `${r.heading}. ${r.description}`), 'document')
        } catch (e) {
          const q = quotaInfo(e)
          if (!q) throw e
          if (q.daily) {
            console.log(`\nDaily free-tier quota reached after ${done}/${total}. Re-run "npm run hs:embed" tomorrow; it resumes where it stopped.`)
            return
          }
          console.log(`\n  rate limited, waiting ${Math.round(q.retryMs / 1000)}s (attempt ${attempt}/8)`)
          await sleep(q.retryMs)
        }
      }
      if (!vectors) throw new Error('Gave up after repeated rate limits')

      await db.transaction(async (tx) => {
        for (const [i, r] of batch.entries()) await tx.update(schema.hsCodes).set({ embedding: vectors![i]! }).where(eq(schema.hsCodes.code, r.code))
      })
      done += batch.length
      const eta = Math.ceil(((total - done) / BATCH) * (WINDOW_MS / 60_000))
      console.log(`Embedded ${done}/${total} codes${total - done > 0 ? ` (~${eta} min left)` : ''}`)

      const wait = WINDOW_MS - (Date.now() - started)
      if (wait > 0 && done < total) await sleep(wait)
    }
    console.log(`\nDone: all ${total} codes embedded with ${embedder.name}. Set EMBEDDING_PROVIDER=google to use semantic search.`)
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error('FAILED:', String((e as Error)?.message ?? e).replace(/AQ\.\S+|AIza\S+|postgres(ql)?:\/\/\S+/g, '[redacted]').slice(0, 300))
  process.exit(1)
})
