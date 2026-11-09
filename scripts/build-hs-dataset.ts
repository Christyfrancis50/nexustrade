/**
 * Builds src/db/data/hs-codes.json from the public HS dataset:
 *   https://github.com/datasets/harmonized-system (data/harmonized-system.csv)
 *   Licence: ODC-PDDL-1.0 (public domain). Source: UN Comtrade nomenclature.
 *
 *   npx tsx scripts/build-hs-dataset.ts <path-to-harmonized-system.csv>
 *
 * Keeps every 6-digit subheading with its 4-digit heading text (many subheadings
 * just say "Other", so the heading is what makes them searchable).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { HS_CODES as CURATED } from '../src/db/data/hs-codes'
import { indicativeDuty } from '../src/db/data/hs-rules'

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field || row.length) rows.push([...row, field])
  return rows
}

const src = process.argv[2]
if (!src) throw new Error('Usage: tsx scripts/build-hs-dataset.ts <harmonized-system.csv>')

const [header, ...rows] = parseCsv(readFileSync(src, 'utf8'))
const col = (name: string) => header!.indexOf(name)
const [iCode, iDesc, iParent, iLevel, iSection] = ['hscode', 'description', 'parent', 'level', 'section'].map(col)
if ([iCode, iDesc, iParent, iLevel, iSection].some((i) => i! < 0)) throw new Error(`Unexpected header: ${header}`)

const headings = new Map(rows.filter((r) => r[iLevel!] === '4').map((r) => [r[iCode!]!, r[iDesc!]!]))
const out = rows
  // Chapter 99 ("commodities not specified") is a Comtrade statistics bucket, not a tariff line.
  .filter((r) => r[iLevel!] === '6' && /^\d{6}$/.test(r[iCode!]!) && !r[iCode!]!.startsWith('99'))
  .map((r) => {
    const code = r[iCode!]!
    const duty = indicativeDuty(code)
    return {
      code,
      description: r[iDesc!]!.trim(),
      heading: (headings.get(r[iParent!]!) ?? '').trim(),
      section: r[iSection!]!,
      dutyRateBp: duty.dutyRateBp,
      restricted: duty.restricted,
    }
  })
  .sort((a, b) => a.code.localeCompare(b.code))

const known = new Set(out.map((o) => o.code))
const missing = CURATED.filter((c) => !known.has(c.code)).map((c) => c.code)
if (missing.length) throw new Error(`Curated codes not found in the official list: ${missing.join(', ')}`)

writeFileSync(join(process.cwd(), 'src/db/data/hs-codes.json'), JSON.stringify(out) + '\n')
console.log(`Wrote ${out.length} subheadings (${headings.size} headings). All ${CURATED.length} curated codes verified.`)
