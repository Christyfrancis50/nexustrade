import { fromMinor, toMinor } from '@/lib/money'
import { lineTotal } from '@/lib/tax/invoice'
import type { ExtractedDocument } from './extraction-schema'

export type Flag =
  | { code: 'SUBTOTAL_MISMATCH'; stated: string; computed: string }
  | { code: 'TOTAL_MISMATCH'; stated: string; expected: string }
  | { code: 'INVALID_TRN'; party: 'shipper' | 'consignee'; value: string }
  | { code: 'MISSING_UAE_TRN' }
  | { code: 'MISSING_PRICES'; lines: number[] }
  | { code: 'NO_LINE_ITEMS' }

export type Reconciliation = {
  computedSubtotal: string | null
  flags: Flag[]
  hasDiscrepancy: boolean
}

/** Flags that mean the numbers on the document can't be trusted as-is. */
const DISCREPANCY: ReadonlySet<Flag['code']> = new Set(['SUBTOTAL_MISMATCH', 'TOTAL_MISMATCH', 'INVALID_TRN'])

const TRN = /^\d{15}$/
const normaliseTrn = (v: string) => v.replace(/[\s-]/g, '')

/**
 * Never trust the model's arithmetic: recompute every line, compare with the
 * printed figures, and validate tax numbers. Pure and deterministic.
 */
export function reconcile(doc: ExtractedDocument): Reconciliation {
  const flags: Flag[] = []

  for (const partyKey of ['shipper', 'consignee'] as const) {
    const trn = doc[partyKey].trn
    if (trn && !TRN.test(normaliseTrn(trn))) flags.push({ code: 'INVALID_TRN', party: partyKey, value: trn })
  }
  if (doc.documentType === 'COMMERCIAL_INVOICE' && doc.destinationPort?.startsWith('AE') && !doc.consignee.trn)
    flags.push({ code: 'MISSING_UAE_TRN' })

  if (doc.lineItems.length === 0) {
    flags.push({ code: 'NO_LINE_ITEMS' })
    return { computedSubtotal: null, flags, hasDiscrepancy: flags.some((f) => DISCREPANCY.has(f.code)) }
  }

  const unpriced = doc.lineItems.flatMap((l, i) => (l.unitPrice === null ? [i + 1] : []))
  let computedSubtotal: string | null = null
  if (unpriced.length === 0) {
    const sum = doc.lineItems.reduce((s, l) => s + lineTotal(l.quantity, l.unitPrice!), 0n)
    computedSubtotal = fromMinor(sum)
    const statedBase = doc.statedSubtotal ?? (doc.statedVat === null ? doc.statedTotal : null)
    if (statedBase !== null && toMinor(statedBase) !== sum)
      flags.push({ code: 'SUBTOTAL_MISMATCH', stated: statedBase, computed: computedSubtotal })
  } else if (doc.documentType === 'COMMERCIAL_INVOICE') {
    flags.push({ code: 'MISSING_PRICES', lines: unpriced })
  }

  if (doc.statedSubtotal !== null && doc.statedVat !== null && doc.statedTotal !== null) {
    const expected = toMinor(doc.statedSubtotal) + toMinor(doc.statedVat)
    if (expected !== toMinor(doc.statedTotal))
      flags.push({ code: 'TOTAL_MISMATCH', stated: doc.statedTotal, expected: fromMinor(expected) })
  }

  return { computedSubtotal, flags, hasDiscrepancy: flags.some((f) => DISCREPANCY.has(f.code)) }
}

export function describeFlag(f: Flag): string {
  switch (f.code) {
    case 'SUBTOTAL_MISMATCH':
      return `Line items add up to ${f.computed}, but the document states ${f.stated}.`
    case 'TOTAL_MISMATCH':
      return `Subtotal + VAT should be ${f.expected}, but the document states a total of ${f.stated}.`
    case 'INVALID_TRN':
      return `The ${f.party}'s TRN "${f.value}" is not a valid 15-digit UAE TRN.`
    case 'MISSING_UAE_TRN':
      return 'Invoice for a UAE destination has no consignee TRN.'
    case 'MISSING_PRICES':
      return `Line${f.lines.length > 1 ? 's' : ''} ${f.lines.join(', ')} have no unit price.`
    case 'NO_LINE_ITEMS':
      return 'No line items were found.'
  }
}
