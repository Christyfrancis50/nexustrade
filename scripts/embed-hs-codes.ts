/**
 * Fill hs_codes.embedding for semantic HS search (idempotent: only empty rows).
 *   npm run hs:embed
 * Needs DATABASE_URL and GOOGLE_GENERATIVE_AI_API_KEY (Google AI Studio free tier).
 * ~5,600 short texts in batches of 100; safe to stop and re-run.
 */
import { eq, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { z } from 'zod'
import * as schema from '../src/db/schema'
import { googleEmbedder } from '../src/features/hs/embedder'

const env = z.object({ DATABASE_URL: z.url(), GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1) }).parse(process.env)
const client = postgres(env.DATABASE_URL, { prepare: false, max: 2 })
const db = drizzle(client, { schema, casing: 'snake_case' })

try {
  const embedder = await googleEmbedder(env.GOOGLE_GENERATIVE_AI_API_KEY)
  let done = 0
  for (;;) {
    const batch = await db
      .select({ code: schema.hsCodes.code, description: schema.hsCodes.description, heading: schema.hsCodes.heading })
      .from(schema.hsCodes)
      .where(isNull(schema.hsCodes.embedding))
      .limit(100)
    if (batch.length === 0) break
    const vectors = await embedder.embed(batch.map((r) => `${r.heading}. ${r.description}`), 'document')
    for (const [i, r] of batch.entries())
      await db.update(schema.hsCodes).set({ embedding: vectors[i]! }).where(eq(schema.hsCodes.code, r.code))
    done += batch.length
    process.stdout.write(`\rEmbedded ${done} codes…`)
  }
  console.log(`\nDone with ${embedder.name}. Set EMBEDDING_PROVIDER=google to use semantic search.`)
} finally {
  await client.end()
}
