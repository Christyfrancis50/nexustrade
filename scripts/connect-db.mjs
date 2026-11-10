// Asks ONLY for the Supabase database password (input is hidden), builds the
// transaction-pooler URL, tests it, then saves DATABASE_URL to .env and to the
// linked Vercel project (Production + Preview). Nothing secret is ever printed.
//   npm run connect:db
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { Writable } from 'node:stream'
import postgres from 'postgres'

const PROJECT_REF = 'mngpvrglwqtipgpowafe'
const REGION = 'ap-south-1'
// Supabase's pooler host prefix differs by project age; try both.
const HOSTS = [`aws-1-${REGION}.pooler.supabase.com`, `aws-0-${REGION}.pooler.supabase.com`]

// One reader for every prompt; its echo goes to a muted stream so nothing typed is shown.
const muted = new Writable({ write: (_c, _e, done) => done() })
const rl = createInterface({ input: process.stdin, output: muted, terminal: Boolean(process.stdin.isTTY) })
const waiting = []
const buffered = []
let closed = false
rl.on('line', (l) => (waiting.length ? waiting.shift()(l.trim()) : buffered.push(l.trim())))
rl.on('close', () => {
  closed = true
  while (waiting.length) waiting.shift()('')
})

function askHidden(question) {
  process.stdout.write(question)
  return new Promise((resolve) => {
    const done = (v) => (process.stdout.write('\n'), resolve(v))
    if (buffered.length) done(buffered.shift())
    else if (closed) done('')
    else waiting.push(done)
  })
}

async function tryConnect(url) {
  const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 10, idle_timeout: 1 })
  try {
    await sql`select 1`
    return { ok: true }
  } catch (e) {
    return { ok: false, message: String(e?.message ?? e) }
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {})
  }
}

let url = null
for (let attempt = 1; attempt <= 3 && !url; attempt++) {
  const password = await askHidden('Supabase database password for project "nexustrade" (hidden): ')
  if (!password) continue
  for (const host of HOSTS) {
    const candidate = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(password)}@${host}:6543/postgres`
    const r = await tryConnect(candidate)
    if (r.ok) {
      url = candidate
      console.log(`  ✓ Connected through ${host}`)
      break
    }
    if (/password authentication failed|SASL/i.test(r.message)) {
      console.log('  ✗ Wrong password. Try again (or reset it in Supabase > Project Settings > Database).')
      break
    }
  }
  if (!url && attempt === 3) console.log('  ✗ Could not connect after 3 tries.')
}
if (!url) process.exit(1)

// 1) Local .env
if (!existsSync('.env')) copyFileSync('.env.example', '.env')
let env = readFileSync('.env', 'utf8')
env = /^DATABASE_URL=.*$/m.test(env) ? env.replace(/^DATABASE_URL=.*$/m, () => `DATABASE_URL=${url}`) : `${env.trimEnd()}\nDATABASE_URL=${url}\n`
writeFileSync('.env', env)
console.log('  ✓ Saved to .env (git-ignored)')

// 2) Vercel (value goes through stdin, never on the command line)
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
for (const target of ['production', 'preview']) {
  const r = spawnSync(npx, ['--yes', 'vercel@latest', 'env', 'add', 'DATABASE_URL', target, '--force', '--sensitive'], {
    input: url,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  const ok = r.status === 0
  console.log(ok ? `  ✓ Saved to Vercel (${target})` : `  ✗ Vercel (${target}) failed: ${(r.stderr || r.stdout || '').split('\n').filter(Boolean).slice(-1)[0] ?? 'unknown error'}`)
}
console.log('\nDone. Tell Claude "redeploy".')
process.exit(0)
