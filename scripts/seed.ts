/**
 * CLI for the demo seed:  npm run db:seed   (needs DATABASE_URL in .env)
 * The seed logic lives in src/db/seed.ts so tests can run it against PGlite.
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../src/db/schema'
import { seed } from '../src/db/seed'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set. Run `npm run setup:env` or fill in .env first.')
  const client = postgres(url, { prepare: false, max: 1 })
  try {
    console.log('Seeded:', await seed(drizzle(client, { schema, casing: 'snake_case' })))
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
