import { describe, expect, it } from 'vitest'
import { checkUpload, MAX_UPLOAD_BYTES, safeFilename, sniffMime, UploadRejected } from './file-check'
import { extractedDocumentSchema, type RawExtraction } from './extraction-schema'
import { describeFlag, reconcile } from './reconcile'

const PDF = new TextEncoder().encode('%PDF-1.7\n...')
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])

describe('file checks', () => {
  it('detects the real type from magic bytes', () => {
    expect(sniffMime(PDF)).toBe('application/pdf')
    expect(sniffMime(PNG)).toBe('image/png')
    expect(sniffMime(JPG)).toBe('image/jpeg')
    expect(sniffMime(new TextEncoder().encode('<html>'))).toBeNull()
  })

  it('rejects disguised, empty and oversized files', () => {
    const exe = new TextEncoder().encode('MZ\x90\x00 pretending.pdf')
    expect(() => checkUpload(exe, 'invoice.pdf')).toThrow(UploadRejected)
    expect(() => checkUpload(new Uint8Array(), 'x.pdf')).toThrow(/empty/)
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1)
    big.set(PDF)
    expect(() => checkUpload(big, 'big.pdf')).toThrow(/10 MB/)
  })

  it('hashes content and cleans the display name', () => {
    const f = checkUpload(PDF, '../../etc/<script>invoice.pdf')
    expect(f.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(f.filename).toBe('_script_invoice.pdf')
    expect(safeFilename('C:\\Users\\me\\BoL 123.pdf')).toBe('BoL 123.pdf')
  })
})

const base: RawExtraction = {
  documentType: 'COMMERCIAL_INVOICE',
  documentNumber: 'CI-1',
  documentDate: '2026-10-01',
  shipper: { name: 'Ningbo Co', trn: null },
  consignee: { name: 'Gulf LLC', trn: '100234567800003' },
  originPort: 'cn ngb',
  destinationPort: 'AEJEA',
  currency: 'USD',
  lineItems: [
    { description: 'Seals', quantity: 2000, unit: 'PCS', unitPrice: '1.85', weightKg: 120, volumeCbm: null },
    { description: 'Pumps', quantity: '40', unit: 'PCS', unitPrice: 310, weightKg: null, volumeCbm: null },
  ],
  statedSubtotal: '16,100.00',
  statedVat: null,
  statedTotal: 16100,
}
const parse = (over: Partial<RawExtraction> = {}) => extractedDocumentSchema.parse({ ...base, ...over })

describe('extraction schema', () => {
  it('normalises numbers, thousands separators and port codes', () => {
    const d = parse()
    expect(d.originPort).toBe('CNNGB')
    expect(d.statedSubtotal).toBe('16100.00')
    expect(d.lineItems[0]!.quantity).toBe('2000')
    expect(d.lineItems[1]!.unitPrice).toBe('310')
  })

  it('rejects malformed model output', () => {
    expect(() => parse({ originPort: 'Shanghai' })).toThrow()
    expect(() => parse({ statedTotal: '-5' })).toThrow()
    expect(() => parse({ statedTotal: '1.234' })).toThrow()
  })
})

describe('reconcile', () => {
  it('passes a document whose numbers add up', () => {
    const r = reconcile(parse())
    expect(r).toEqual({ computedSubtotal: '16100.00', flags: [], hasDiscrepancy: false })
  })

  it('flags a subtotal that does not match the line items', () => {
    const r = reconcile(parse({ statedSubtotal: '17550.00', statedTotal: '17550.00' }))
    expect(r.hasDiscrepancy).toBe(true)
    expect(r.flags[0]).toEqual({ code: 'SUBTOTAL_MISMATCH', stated: '17550.00', computed: '16100.00' })
    expect(describeFlag(r.flags[0]!)).toMatch(/add up to 16100.00/)
  })

  it('flags a total that is not subtotal + VAT', () => {
    const r = reconcile(parse({ statedVat: '805.00', statedTotal: '16900.00' }))
    expect(r.flags).toContainEqual({ code: 'TOTAL_MISMATCH', stated: '16900.00', expected: '16905.00' })
  })

  it('flags invalid and missing TRNs', () => {
    const bad = reconcile(parse({ consignee: { name: 'Gulf LLC', trn: '12345' } }))
    expect(bad.flags).toContainEqual({ code: 'INVALID_TRN', party: 'consignee', value: '12345' })
    expect(bad.hasDiscrepancy).toBe(true)
    const missing = reconcile(parse({ consignee: { name: 'Gulf LLC', trn: null } }))
    expect(missing.flags).toContainEqual({ code: 'MISSING_UAE_TRN' })
    expect(missing.hasDiscrepancy).toBe(false) // a warning, not a maths problem
  })

  it('accepts TRNs printed with spaces or dashes', () => {
    expect(reconcile(parse({ consignee: { name: 'G', trn: '100-2345-6780-0003' } })).flags).toEqual([])
  })

  it('handles unpriced documents like packing lists', () => {
    const pl = parse({
      documentType: 'PACKING_LIST',
      statedSubtotal: null,
      statedTotal: null,
      lineItems: [{ description: 'Seals', quantity: 2000, unit: 'PCS', unitPrice: null, weightKg: 120, volumeCbm: 1.2 }],
    })
    expect(reconcile(pl)).toEqual({ computedSubtotal: null, flags: [], hasDiscrepancy: false })
  })
})
