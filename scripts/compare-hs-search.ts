/**
 * Compares keyword vs semantic HS suggestions on goods descriptions with known
 * correct headings. Read-only.  npx tsx --env-file=.env scripts/compare-hs-search.ts
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../src/db/schema'
import { suggestHsCodes } from '../src/features/hs/classify'
import { googleEmbedder } from '../src/features/hs/embedder'

// [description, expected 4-digit heading]
const CASES: Array<[string, string]> = [
  ['Hydraulic pump valve seals, nitrile rubber', '4016'],
  ['Gear pump assembly, cast iron, 40 L/min', '8413'],
  ['Stainless steel ball valves, 2 inch', '8481'],
  ['Monocrystalline PV panels 550 W, assembled modules', '8541'],
  ['Basmati rice, wholly milled, 25 kg bags', '1006'],
  ['55-inch 4K colour LED televisions', '8528'],
  ['Split-unit wall air conditioners 1.5 ton', '8415'],
  ['Laptops 14-inch, 1.3 kg', '8471'],
  ['Excavator bucket teeth and adapters', '8431'],
  ['Cotton crew-neck T-shirts, knitted', '6109'],
]

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 2 })
  const db = drizzle(client, { schema, casing: 'snake_case' })
  const embedder = await googleEmbedder(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)
  let kw = 0
  let sem = 0
  try {
    for (const [text, heading] of CASES) {
      const [k] = await suggestHsCodes(db, text)
      const [s] = await suggestHsCodes(db, text, { embedder })
      const kOk = k?.code.startsWith(heading) ?? false
      const sOk = s?.code.startsWith(heading) ?? false
      kw += kOk ? 1 : 0
      sem += sOk ? 1 : 0
      console.log(`${heading}  keyword ${k?.code ?? '-'} ${kOk ? '✓' : '✗'}   semantic ${s?.code ?? '-'} ${sOk ? '✓' : '✗'} (${s?.confidence ?? '-'})   ${text}`)
    }
    console.log(`\nTop-1 correct heading: keyword ${kw}/${CASES.length}, semantic ${sem}/${CASES.length}`)
  } finally {
    await client.end()
  }
}
main().catch((e) => {
  console.error('FAILED:', String(e?.message ?? e).replace(/AQ\.\S+|AIza\S+|postgres(ql)?:\/\/\S+/g, '[redacted]').slice(0, 300))
  process.exit(1)
})
