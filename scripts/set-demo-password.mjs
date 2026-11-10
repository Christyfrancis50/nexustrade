// Sets the password of the three demo accounts to DEMO_USER_PASSWORD from .env,
// using DATABASE_URL. Prints only counts, never the password.
//   npm run auth:demo-password
import { readFileSync } from 'node:fs'
import postgres from 'postgres'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const url = env.DATABASE_URL
const password = env.DEMO_USER_PASSWORD
if (!url) throw new Error('DATABASE_URL is empty in .env')
if (!password || password.length < 12) throw new Error('Set DEMO_USER_PASSWORD in .env (12+ characters) and save the file')

const EMAILS = ['coordinator@nexustrade.test', 'broker@nexustrade.test', 'finance@nexustrade.test']
const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 10 })
try {
  // bcrypt via pgcrypto, exactly how Supabase Auth stores passwords.
  const rows = await sql`
    update auth.users
    set encrypted_password = extensions.crypt(${password}, extensions.gen_salt('bf')), updated_at = now()
    where email in ${sql(EMAILS)}
    returning email`
  console.log(`Updated the password for ${rows.length} demo account(s): ${rows.map((r) => r.email).join(', ')}`)
  if (rows.length !== 3) process.exitCode = 1
} finally {
  await sql.end({ timeout: 2 })
}
