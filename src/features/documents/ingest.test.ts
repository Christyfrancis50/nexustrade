import { beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '../../../test/pglite'
import * as schema from '@/db/schema'
import { checkUpload } from './file-check'
import { modelOutputSchema } from './extraction-schema'
import { ingestDocument, markReviewed } from './ingest'
import { mockProvider, type ExtractionProvider } from './providers'
import { memoryStore } from './store'

let t: TestDb
let shipmentId: string
const store = memoryStore()
const pdf = (label: string, name = 'invoice.pdf') => checkUpload(new TextEncoder().encode(`%PDF-1.7 ${label}`), name)
const ingest = (file: ReturnType<typeof pdf>, documentType: 'COMMERCIAL_INVOICE' | 'PACKING_LIST' = 'COMMERCIAL_INVOICE', provider: ExtractionProvider = mockProvider) =>
  ingestDocument(t.db, { store, provider }, { shipmentId, documentType, file, uploadedBy: null })

beforeAll(async () => {
  t = await createTestDb()
  const [s] = await t.db
    .insert(schema.shipments)
    .values({ trackingNumber: 'T-1', mode: 'SEA', shipperName: 'A', consigneeName: 'B', carrierName: 'C', originPort: 'CNNGB', destinationPort: 'AEJEA', freightAmount: '1000.00' })
    .returning()
  shipmentId = s!.id
}, 60_000)

describe('ingestDocument', () => {
  it('stores, extracts, reconciles and saves invoice line items', async () => {
    const r = await ingest(pdf('one'))
    expect(r.status).toBe('EXTRACTED')
    if (r.status !== 'EXTRACTED') return
    expect(r.reconciliation.hasDiscrepancy).toBe(false)
    expect(r.lineItemsAdded).toBe(3)
    const [doc] = await t.db.select().from(schema.documents).where(eq(schema.documents.id, r.documentId))
    expect(doc).toMatchObject({ extractionStatus: 'EXTRACTED', computedTotal: '22475.00', statedTotal: '22475.00', hasDiscrepancy: false, extractionProvider: 'mock' })
    expect(store.files.has(doc!.storagePath)).toBe(true)
    expect(doc!.storagePath).toMatch(new RegExp(`^${shipmentId}/[0-9a-f]{64}\\.pdf$`))
  })

  it('treats a re-upload of the same file as a duplicate', async () => {
    const r = await ingest(pdf('one'))
    expect(r.status).toBe('DUPLICATE')
    expect(await t.db.$count(schema.documents)).toBe(1)
  })

  it('flags a mismatched invoice and keeps numbering line items', async () => {
    const r = await ingest(pdf('two', 'supplier-mismatch.pdf'))
    expect(r.status === 'EXTRACTED' && r.reconciliation.hasDiscrepancy).toBe(true)
    const lines = await t.db.select({ n: schema.lineItems.lineNo }).from(schema.lineItems).where(eq(schema.lineItems.shipmentId, shipmentId))
    expect(lines.map((l) => l.n).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('does not create line items from unpriced documents', async () => {
    const before = await t.db.$count(schema.lineItems)
    const r = await ingest(pdf('three', 'packing.pdf'), 'PACKING_LIST')
    expect(r.status).toBe('EXTRACTED')
    expect(await t.db.$count(schema.lineItems)).toBe(before)
  })

  it('records provider failures instead of losing the upload', async () => {
    const broken: ExtractionProvider = { name: 'broken', extract: async () => { throw new Error('rate limited') } }
    const r = await ingest(pdf('four'), 'COMMERCIAL_INVOICE', broken)
    expect(r).toMatchObject({ status: 'FAILED', error: 'Extraction failed: rate limited' })
  })

  it('rejects malformed model output with a clear message', async () => {
    const sloppy: ExtractionProvider = { name: 'sloppy', extract: async () => ({ documentType: 'INVOICE', lineItems: 'lots' }) }
    const r = await ingest(pdf('five'), 'COMMERCIAL_INVOICE', sloppy)
    expect(r.status === 'FAILED' && r.error).toMatch(/did not match the expected format/)
  })

  it('only extracted documents can be marked reviewed', async () => {
    const ok = await ingest(pdf('six'))
    expect(await markReviewed(t.db, ok.documentId)).toBe(true)
    expect(await markReviewed(t.db, ok.documentId)).toBe(false) // already reviewed
  })

  it('refuses unknown shipments', async () => {
    await expect(
      ingestDocument(t.db, { store, provider: mockProvider }, { shipmentId: '00000000-0000-0000-0000-000000000000', documentType: 'COMMERCIAL_INVOICE', file: pdf('x'), uploadedBy: null }),
    ).rejects.toThrow(/Shipment not found/)
  })
})

describe('model output schema', () => {
  it('converts to JSON Schema for structured output', () => {
    expect(() => z.toJSONSchema(modelOutputSchema)).not.toThrow()
  })
})
