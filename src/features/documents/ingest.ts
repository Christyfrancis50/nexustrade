import { and, eq, max } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { ZodError } from 'zod'
import * as schema from '@/db/schema'
import { EXTENSION, type CheckedFile } from './file-check'
import { extractedDocumentSchema } from './extraction-schema'
import type { DocumentKind, ExtractionProvider } from './providers'
import { reconcile, type Reconciliation } from './reconcile'
import type { DocumentStore } from './store'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export type IngestResult =
  | { documentId: string; status: 'DUPLICATE' }
  | { documentId: string; status: 'EXTRACTED'; reconciliation: Reconciliation; lineItemsAdded: number }
  | { documentId: string; status: 'FAILED'; error: string }

export class IngestError extends Error {
  override name = 'IngestError'
}

/**
 * Store a checked file, extract it with the configured provider, re-validate and
 * reconcile the result, and save line items from commercial invoices.
 *
 * - Re-uploading the same file to the same shipment is a no-op (content hash).
 * - The document row is saved before extraction, so a provider failure is
 *   recorded as FAILED rather than losing the upload.
 */
export async function ingestDocument(
  db: Db,
  deps: { store: DocumentStore; provider: ExtractionProvider },
  input: { shipmentId: string; documentType: DocumentKind; file: CheckedFile; uploadedBy: string | null },
): Promise<IngestResult> {
  const [shipment] = await db.select({ id: schema.shipments.id }).from(schema.shipments).where(eq(schema.shipments.id, input.shipmentId))
  if (!shipment) throw new IngestError('Shipment not found')

  const [dup] = await db
    .select({ id: schema.documents.id })
    .from(schema.documents)
    .where(and(eq(schema.documents.shipmentId, input.shipmentId), eq(schema.documents.sha256, input.file.sha256)))
  if (dup) return { documentId: dup.id, status: 'DUPLICATE' }

  const key = `${input.shipmentId}/${input.file.sha256}.${EXTENSION[input.file.mimeType]}`
  await deps.store.put(key, input.file.bytes, input.file.mimeType)

  const [doc] = await db
    .insert(schema.documents)
    .values({
      shipmentId: input.shipmentId,
      type: input.documentType,
      storagePath: key,
      originalFilename: input.file.filename,
      mimeType: input.file.mimeType,
      sizeBytes: input.file.sizeBytes,
      sha256: input.file.sha256,
      extractionStatus: 'PENDING',
      extractionProvider: deps.provider.name,
      uploadedBy: input.uploadedBy,
    })
    .onConflictDoNothing({ target: [schema.documents.shipmentId, schema.documents.sha256] })
    .returning({ id: schema.documents.id })
  if (!doc) {
    // Lost a race with an identical concurrent upload.
    const [winner] = await db
      .select({ id: schema.documents.id })
      .from(schema.documents)
      .where(and(eq(schema.documents.shipmentId, input.shipmentId), eq(schema.documents.sha256, input.file.sha256)))
    return { documentId: winner!.id, status: 'DUPLICATE' }
  }

  let extracted
  try {
    extracted = extractedDocumentSchema.parse(await deps.provider.extract(input.file, { documentType: input.documentType }))
  } catch (e) {
    const error =
      e instanceof ZodError
        ? 'The extraction did not match the expected format. Please review the document manually.'
        : `Extraction failed: ${e instanceof Error ? e.message.slice(0, 300) : 'unknown error'}`
    await db.update(schema.documents).set({ extractionStatus: 'FAILED', extractionError: error }).where(eq(schema.documents.id, doc.id))
    return { documentId: doc.id, status: 'FAILED', error }
  }

  const reconciliation = reconcile(extracted)
  const invoiceLines =
    extracted.documentType === 'COMMERCIAL_INVOICE' && extracted.currency && extracted.lineItems.every((l) => l.unitPrice !== null)
      ? extracted.lineItems
      : []

  await db.transaction(async (tx) => {
    await tx
      .update(schema.documents)
      .set({
        extractionStatus: 'EXTRACTED',
        documentNumber: extracted.documentNumber,
        extracted,
        flags: reconciliation.flags,
        statedTotal: extracted.statedTotal ?? extracted.statedSubtotal,
        computedTotal: reconciliation.computedSubtotal,
        hasDiscrepancy: reconciliation.hasDiscrepancy,
        extractionError: null,
      })
      .where(eq(schema.documents.id, doc.id))

    if (invoiceLines.length) {
      const [{ last }] = (await tx
        .select({ last: max(schema.lineItems.lineNo) })
        .from(schema.lineItems)
        .where(eq(schema.lineItems.shipmentId, input.shipmentId))) as [{ last: number | null }]
      await tx.insert(schema.lineItems).values(
        invoiceLines.map((l, i) => ({
          shipmentId: input.shipmentId,
          documentId: doc.id,
          lineNo: (last ?? 0) + i + 1,
          description: l.description,
          quantity: l.quantity,
          unit: l.unit.toUpperCase().slice(0, 10),
          unitPrice: l.unitPrice!,
          currency: extracted.currency!,
          weightKg: l.weightKg,
          volumeCbm: l.volumeCbm,
        })),
      )
    }
  })

  return { documentId: doc.id, status: 'EXTRACTED', reconciliation, lineItemsAdded: invoiceLines.length }
}

/** A coordinator confirms the extraction after checking it against the file. */
export async function markReviewed(db: Db, documentId: string): Promise<boolean> {
  const rows = await db
    .update(schema.documents)
    .set({ extractionStatus: 'REVIEWED' })
    .where(and(eq(schema.documents.id, documentId), eq(schema.documents.extractionStatus, 'EXTRACTED')))
    .returning({ id: schema.documents.id })
  return rows.length === 1
}
