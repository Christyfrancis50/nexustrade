'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db'
import { requireRole } from '@/lib/auth/session'
import { suggestForPendingLines } from './classify'
import { getEmbedder } from './config'
import { clearShipment, CustomsError, decideLine, holdShipment } from './review'

export type ActionState = { ok?: boolean; message?: string }

const PATH = '/workspace/broker'

async function run(fn: () => Promise<string>): Promise<ActionState> {
  try {
    const message = await fn()
    revalidatePath(PATH)
    return { ok: true, message }
  } catch (e) {
    if (e instanceof CustomsError) return { ok: false, message: e.message }
    console.error('customs action failed', e)
    return { ok: false, message: 'Something went wrong. Please try again.' }
  }
}

const decideSchema = z.object({
  lineItemId: z.uuid(),
  chosenCode: z.string().trim().regex(/^\d{6}$/, 'Enter a 6-digit HS code'),
  note: z.string().trim().max(500).optional(),
})

export async function decideLineAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole('broker')
  const override = String(formData.get('override') ?? '').trim()
  const parsed = decideSchema.safeParse({
    lineItemId: formData.get('lineItemId'),
    chosenCode: override || formData.get('choice'),
    note: formData.get('note') || undefined,
  })
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Choose a code' }
  return run(async () => {
    const r = await decideLine(db(), { ...parsed.data, brokerId: user.id })
    return r.restricted
      ? `${r.decision === 'APPROVED' ? 'Approved' : 'Overridden'}. Restricted goods: shipment placed on customs hold.`
      : r.decision === 'APPROVED'
        ? 'Approved.'
        : 'Override recorded.'
  })
}

const shipmentSchema = z.object({ shipmentId: z.uuid() })

export async function clearShipmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole('broker')
  const parsed = shipmentSchema.safeParse({ shipmentId: formData.get('shipmentId') })
  if (!parsed.success) return { ok: false, message: 'Unknown shipment' }
  return run(async () => {
    await clearShipment(db(), { shipmentId: parsed.data.shipmentId, brokerId: user.id })
    return 'Customs cleared. Finance can now release the 40% milestone.'
  })
}

export async function holdShipmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole('broker')
  const parsed = shipmentSchema.extend({ reason: z.string().trim().min(3, 'Give a reason').max(300) }).safeParse({
    shipmentId: formData.get('shipmentId'),
    reason: formData.get('reason'),
  })
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid input' }
  return run(async () => {
    await holdShipment(db(), { ...parsed.data, brokerId: user.id })
    return 'Shipment placed on customs hold.'
  })
}

export async function refreshSuggestionsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole('broker')
  const parsed = shipmentSchema.safeParse({ shipmentId: formData.get('shipmentId') })
  if (!parsed.success) return { ok: false, message: 'Unknown shipment' }
  return run(async () => {
    const n = await suggestForPendingLines(db(), { shipmentId: parsed.data.shipmentId, embedder: await getEmbedder() })
    return n ? `Suggested codes for ${n} line${n > 1 ? 's' : ''}.` : 'No unclassified lines.'
  })
}
