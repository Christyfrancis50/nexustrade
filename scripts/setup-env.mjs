// Interactive .env setup: asks for the secrets, validates them and writes them
// into .env. Input is fully hidden: nothing you type or paste is ever echoed.
//   npm run setup:env
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { Writable } from 'node:stream'

const FILE = '.env'
if (!existsSync(FILE)) copyFileSync('.env.example', FILE)

// One reader for all questions. Its output goes to a muted stream, so echo and
// line redraws (which would contain the secret) are swallowed; prompts are
// printed separately to stdout.
const muted = new Writable({ write: (_chunk, _enc, done) => done() })
const rl = createInterface({ input: process.stdin, output: muted, terminal: Boolean(process.stdin.isTTY) })
const pending = []
const queued = []
rl.on('line', (line) => (pending.length ? pending.shift()(line.trim()) : queued.push(line.trim())))

function askHidden(question) {
  process.stdout.write(question)
  return new Promise((resolve) => {
    const done = (v) => {
      process.stdout.write('\n')
      resolve(v)
    }
    if (queued.length) done(queued.shift())
    else pending.push(done)
  })
}

const fields = [
  {
    key: 'DATABASE_URL',
    prompt: 'DATABASE_URL (Supabase > Connect > Transaction pooler, with your password): ',
    check: (v) =>
      /^postgres(ql)?:\/\/[^:\s]+:[^@\s]+@[^/\s]+\/\w+/.test(v) && !/\[YOUR-PASSWORD\]/.test(v)
        ? null
        : 'Expected postgresql://user:password@host:port/postgres with the real password filled in',
  },
  {
    key: 'SUPABASE_SERVICE_ROLE_KEY',
    prompt: 'SUPABASE_SERVICE_ROLE_KEY (Project Settings > API Keys > service_role / secret): ',
    check: (v) => (/^(sb_secret_|eyJ)\S+$/.test(v) ? null : 'Expected a key starting with sb_secret_ or eyJ'),
  },
  {
    key: 'DEMO_USER_PASSWORD',
    prompt: 'DEMO_USER_PASSWORD (any password, 12+ characters, for the 3 demo accounts): ',
    check: (v) => (v.length >= 12 && !/\s/.test(v) ? null : 'Use at least 12 characters, no spaces'),
  },
]

console.log('Paste or type each value and press Enter. Nothing will appear while you type: that is on purpose.\n')
let env = readFileSync(FILE, 'utf8')
for (const f of fields) {
  for (;;) {
    const value = await askHidden(f.prompt)
    const problem = value ? f.check(value) : 'This value is required'
    if (!problem) {
      const line = `${f.key}=${value}`
      const re = new RegExp(`^${f.key}=.*$`, 'm')
      env = re.test(env) ? env.replace(re, () => line) : `${env.trimEnd()}\n${line}\n`
      writeFileSync(FILE, env) // save after each answer, so nothing is lost if you stop midway
      console.log(`  ✓ ${f.key} saved (${value.length} characters)`)
      break
    }
    console.log(`  ✗ ${problem}. Please try again.`)
  }
}
rl.close()
console.log('\nDone. .env is updated (it is git-ignored and never committed). Tell Claude "seed it".')
process.exit(0)
