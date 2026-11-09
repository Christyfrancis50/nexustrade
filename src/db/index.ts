import 'server-only'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '@/env'
import * as schema from './schema'

let client: ReturnType<typeof drizzle<typeof schema>> | undefined

/** Lazily connect so pages that don't touch the DB work without DATABASE_URL. */
export function db() {
  if (client) return client
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set. Copy .env.example to .env and add your Supabase connection string.')
  // `prepare: false` is required for Supabase's transaction pooler (port 6543).
  const sql = postgres(env.DATABASE_URL, { prepare: false, max: 5 })
  client = drizzle(sql, { schema, casing: 'snake_case' })
  return client
}
