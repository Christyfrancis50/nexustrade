import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '../src/db/schema'

/**
 * A real Postgres 17 (WASM) with pgvector, running in-process. It mimics the
 * parts of Supabase our migrations rely on (auth schema, auth.uid(), the
 * anon/authenticated/service_role roles and their default grants), then
 * applies every migration in drizzle/ exactly as `db:migrate` would.
 */
export async function createTestDb() {
  const pg = await PGlite.create({ extensions: { vector } })

  await pg.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text,
      raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
      raw_user_meta_data jsonb DEFAULT '{}'::jsonb
    );
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
  `)

  const dir = join(process.cwd(), 'drizzle')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const statements = readFileSync(join(dir, file), 'utf8').split('--> statement-breakpoint')
    for (const stmt of statements) if (stmt.trim()) await pg.exec(stmt)
  }

  // Supabase's default grants: RLS, not GRANTs, is what restricts access.
  // Supabase also puts `extensions` on every role's search_path (pgvector lives there).
  await pg.exec(`
    ALTER ROLE postgres SET search_path TO "$user", public, extensions;
    ALTER ROLE authenticated SET search_path TO "$user", public, extensions;
    SET search_path TO "$user", public, extensions;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
  `)

  const db = drizzle(pg, { schema, casing: 'snake_case' })

  /** Insert an auth user (fires the profile trigger) and return its id. */
  async function createUser(email: string, role?: string): Promise<string> {
    const res = await pg.query<{ id: string }>(
      `INSERT INTO auth.users (email, raw_app_meta_data, raw_user_meta_data) VALUES ($1, $2, '{}') RETURNING id`,
      [email, role ? { role } : {}],
    )
    return res.rows[0]!.id
  }

  /** Run `fn` as a signed-in Supabase user, so RLS applies exactly as via the API. */
  async function asUser<T>(userId: string, fn: (tx: PGlite) => Promise<T>): Promise<T> {
    await pg.exec('BEGIN')
    try {
      await pg.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId])
      await pg.exec('SET LOCAL ROLE authenticated')
      return await fn(pg)
    } finally {
      await pg.exec('ROLLBACK')
    }
  }

  return { pg, db, createUser, asUser }
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>
