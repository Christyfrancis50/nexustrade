'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db'
import { requireRole } from '@/lib/auth/session'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { checkUpload, MAX_UPLOAD_BYTES, UploadRejected } from './file-check'
import { ingestDocument, IngestError, markReviewed } from './ingest'
import { getExtractionProvider } from './provider-config'
import { describeFlag, type Flag } from './reconcile'
import { supabaseStore } from './store'

const uploadSchema = z.object({
  shipmentId: z.uuid(),
  documentType: z.enum(['BILL_OF_LADING', 'AIRWAY_BILL', 'PACKING_LIST', 'COMMERCIAL_INVOICE', 'PROOF_OF_DELIVERY']),
})

export type UploadState = { ok?: boolean; message?: string; flags?: string[] }

export async function uploadDocument(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const user = await requireRole('coordinator')

  const parsed = uploadSchema.safeParse({ shipmentId: formData.get('shipmentId'), documentType: formData.get('documentType') })
  const file = formData.get('file')
  if (!parsed.success) return { ok: false, message: 'Choose a document type.' }
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Choose a file to upload.' }
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, message: 'Files must be 10 MB or smaller.' }

  const admin = supabaseAdmin()
  if (!admin) return { ok: false, message: 'File storage is not configured. Add SUPABASE_SERVICE_ROLE_KEY to .env.' }

  try {
    const checked = checkUpload(new Uint8Array(await file.arrayBuffer()), file.name)
    const result = await ingestDocument(
      db(),
      { store: supabaseStore(admin), provider: await getExtractionProvider() },
      { shipmentId: parsed.data.shipmentId, documentType: parsed.data.documentType, file: checked, uploadedBy: user.id },
    )
    revalidatePath(`/workspace/coordinator/shipments/${parsed.data.shipmentId}`)

    switch (result.status) {
      case 'DUPLICATE':
        return { ok: true, message: 'This exact file is already attached to the shipment.' }
      case 'FAILED':
        return { ok: false, message: `Saved, but extraction failed. ${result.error}` }
      case 'EXTRACTED': {
        const flags = result.reconciliation.flags.map((f: Flag) => describeFlag(f))
        const summary = result.reconciliation.hasDiscrepancy
          ? 'Extracted, but the numbers need attention.'
          : `Extracted${result.lineItemsAdded ? ` ${result.lineItemsAdded} line items` : ''}. Everything adds up.`
        return { ok: !result.reconciliation.hasDiscrepancy, message: summary, flags }
      }
    }
  } catch (e) {
    if (e instanceof UploadRejected || e instanceof IngestError) return { ok: false, message: e.message }
    console.error('uploadDocument failed', e)
    return { ok: false, message: 'Something went wrong while processing the file. Please try again.' }
  }
}

export async function reviewDocument(formData: FormData): Promise<void> {
  await requireRole('coordinator')
  const ids = z.object({ documentId: z.uuid(), shipmentId: z.uuid() }).safeParse({
    documentId: formData.get('documentId'),
    shipmentId: formData.get('shipmentId'),
  })
  if (!ids.success) return
  await markReviewed(db(), ids.data.documentId)
  revalidatePath(`/workspace/coordinator/shipments/${ids.data.shipmentId}`)
}
