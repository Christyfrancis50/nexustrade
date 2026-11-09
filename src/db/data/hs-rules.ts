import { HS_CODES as CURATED } from './hs-codes'

/**
 * INDICATIVE duty and control rules for a portfolio demo, loosely modelled on
 * the GCC Common Customs Tariff: 5% by default, 0% for many staples and IT
 * goods, much higher for tobacco and alcohol, and permit requirements for
 * controlled goods. Not customs advice: a real deployment would load the
 * official UAE tariff.
 */
const ZERO_CHAPTERS = new Set(['01', '02', '03', '04', '07', '08', '10', '11', '12', '30'])
const ZERO_HEADINGS = new Set(['0901', '0902', '1701', '8471', '8517', '4901'])

/** Chapters / headings needing permits or banned without a licence in the UAE. */
const RESTRICTED_PREFIXES = [
  '93', // arms and ammunition
  '36', // explosives, pyrotechnics
  '2844', // radioactive elements
  '24', // tobacco (excise, licensing)
  '2203', '2204', '2205', '2206', '2208', // alcoholic beverages
  '30', // medicaments (MOHAP registration)
  '3808', // pesticides
  '9018', // medical devices
  '8525', '8526', // transmitters and radar (TDRA approval)
]

const curated = new Map(CURATED.map((c) => [c.code, c]))

export function indicativeDuty(code: string): { dutyRateBp: number; restricted: boolean } {
  const override = curated.get(code)
  const restricted = override?.restricted ?? RESTRICTED_PREFIXES.some((p) => code.startsWith(p))
  if (override) return { dutyRateBp: override.dutyRateBp, restricted }

  const chapter = code.slice(0, 2)
  const heading = code.slice(0, 4)
  if (chapter === '24') return { dutyRateBp: 10000, restricted }
  if (['2203', '2204', '2205', '2206', '2208'].includes(heading)) return { dutyRateBp: 5000, restricted }
  if (ZERO_CHAPTERS.has(chapter) || ZERO_HEADINGS.has(heading)) return { dutyRateBp: 0, restricted }
  return { dutyRateBp: 500, restricted }
}
