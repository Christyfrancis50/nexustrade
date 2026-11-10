// Copies named variables from .env to the linked Vercel project (Production + Preview)
// as Sensitive values, via stdin. Never prints a value.
//   node scripts/push-env-to-vercel.mjs SUPABASE_SERVICE_ROLE_KEY [MORE_KEYS...]
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const keys = process.argv.slice(2)
if (keys.length === 0) throw new Error('Name at least one variable, e.g. SUPABASE_SERVICE_ROLE_KEY')
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
let failed = false
for (const key of keys) {
  const value = env[key]
  if (!value) {
    console.log(`✗ ${key} is empty in .env. Save it first.`)
    failed = true
    continue
  }
  for (const target of ['production', 'preview']) {
    const r = spawnSync(npx, ['--yes', 'vercel@latest', 'env', 'add', key, target, '--force', '--sensitive'], {
      input: value,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    })
    const ok = r.status === 0
    if (!ok) failed = true
    console.log(ok ? `✓ ${key} → Vercel (${target}), ${value.length} characters` : `✗ ${key} → Vercel (${target}) failed`)
  }
}
process.exit(failed ? 1 : 0)
