import { and, eq, inArray } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export class CustomsError extends Error {
  override name = 'CustomsError'
}

const OPEN_STATUSES = ['IN_TRANSIT', 'CUSTOMS_HOLD'] as const

/**
 * A broker approves the suggested code or overrides it. The decision is
 * recorded for audit, and restricted goods put the shipment on customs hold.
 */
export async function decideLine(
  db: Db,
  input: { lineItemId: string; chosenCode: string; brokerId: string | null; note?: string | null },
): Promise<{ decision: 'APPROVED' | 'OVERRIDDEN'; restricted: boolean }> {
  return db.transaction(async (tx) => {
    const [line] = await tx.select().from(schema.lineItems).where(eq(schema.lineItems.id, input.lineItemId)).for('update')
    if (!line) throw new CustomsError('Line item not found')
    const [shipment] = await tx.select().from(schema.shipments).where(eq(schema.shipments.id, line.shipmentId))
    if (!shipment || !(OPEN_STATUSES as readonly string[]).includes(shipment.status))
      throw new CustomsError('Only shipments in transit or on customs hold can be classified')

    const [hs] = await tx.select().from(schema.hsCodes).where(eq(schema.hsCodes.code, input.chosenCode))
    if (!hs) throw new CustomsError(`HS code ${input.chosenCode} is not in the tariff`)

    const suggested = line.hsStatus === 'SUGGESTED' ? line.hsCode : null
    const decision = suggested === hs.code ? 'APPROVED' : 'OVERRIDDEN'
    if (decision === 'OVERRIDDEN' && !input.note?.trim() && suggested)
      throw new CustomsError('Add a short note explaining why you changed the suggested code')

    await tx
      .update(schema.lineItems)
      .set({ hsCode: hs.code, hsStatus: decision, restricted: hs.restricted })
      .where(eq(schema.lineItems.id, line.id))
    await tx.insert(schema.classificationDecisions).values({
      lineItemId: line.id,
      suggestedCode: suggested,
      chosenCode: hs.code,
      confidence: suggested ? line.hsConfidence : null,
      decision,
      note: input.note?.trim() || null,
      decidedBy: input.brokerId,
    })
    await tx.insert(schema.auditLog).values({
      actorId: input.brokerId,
      action: 'hs.decide',
      entity: 'line_item',
      entityId: line.id,
      data: { decision, suggested, chosen: hs.code, restricted: hs.restricted },
    })

    if (hs.restricted && shipment.status !== 'CUSTOMS_HOLD') {
      await tx.update(schema.shipments).set({ status: 'CUSTOMS_HOLD', updatedAt: new Date() }).where(eq(schema.shipments.id, shipment.id))
      await tx.insert(schema.auditLog).values({
        actorId: input.brokerId,
        action: 'shipment.hold',
        entity: 'shipment',
        entityId: shipment.id,
        data: { reason: `Restricted goods: HS ${hs.code}` },
      })
    }
    return { decision, restricted: hs.restricted }
  })
}

export type ClearanceCheck = { ready: boolean; blockers: string[] }

/** What still stands between a shipment and customs clearance. */
export async function clearanceCheck(db: Db, shipmentId: string): Promise<ClearanceCheck> {
  const [shipment] = await db.select().from(schema.shipments).where(eq(schema.shipments.id, shipmentId))
  if (!shipment) return { ready: false, blockers: ['Shipment not found'] }
  const blockers: string[] = []
  if (!(OPEN_STATUSES as readonly string[]).includes(shipment.status)) blockers.push(`Shipment is ${shipment.status.toLowerCase().replace('_', ' ')}`)

  const lines = await db.select().from(schema.lineItems).where(eq(schema.lineItems.shipmentId, shipmentId))
  if (lines.length === 0) blockers.push('No line items to clear')
  const undecided = lines.filter((l) => l.hsStatus !== 'APPROVED' && l.hsStatus !== 'OVERRIDDEN').length
  if (undecided) blockers.push(`${undecided} line${undecided > 1 ? 's' : ''} still need an HS decision`)
  const restricted = lines.filter((l) => l.restricted).length
  if (restricted) blockers.push(`${restricted} restricted line${restricted > 1 ? 's' : ''} need a permit before release`)

  const flagged = await db
    .select({ id: schema.documents.id })
    .from(schema.documents)
    .where(and(eq(schema.documents.shipmentId, shipmentId), eq(schema.documents.hasDiscrepancy, true), inArray(schema.documents.extractionStatus, ['PENDING', 'EXTRACTED', 'FAILED'])))
  if (flagged.length) blockers.push(`${flagged.length} document${flagged.length > 1 ? 's have' : ' has'} unresolved discrepancies`)

  return { ready: blockers.length === 0, blockers }
}

/** Mark customs cleared. Escrow release for this milestone is wired in Phase 7. */
export async function clearShipment(db: Db, input: { shipmentId: string; brokerId: string | null }): Promise<void> {
  const check = await clearanceCheck(db, input.shipmentId)
  if (!check.ready) throw new CustomsError(`Cannot clear yet: ${check.blockers.join('; ')}`)
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(schema.shipments)
      .set({ status: 'CLEARED', updatedAt: new Date() })
      .where(and(eq(schema.shipments.id, input.shipmentId), inArray(schema.shipments.status, [...OPEN_STATUSES])))
      .returning({ id: schema.shipments.id })
    if (updated.length !== 1) throw new CustomsError('Shipment changed while clearing; reload and try again')
    await tx.insert(schema.auditLog).values({ actorId: input.brokerId, action: 'shipment.clear', entity: 'shipment', entityId: input.shipmentId, data: {} })
  })
}

export async function holdShipment(db: Db, input: { shipmentId: string; brokerId: string | null; reason: string }): Promise<void> {
  if (!input.reason.trim()) throw new CustomsError('Give a reason for the hold')
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(schema.shipments)
      .set({ status: 'CUSTOMS_HOLD', updatedAt: new Date() })
      .where(and(eq(schema.shipments.id, input.shipmentId), eq(schema.shipments.status, 'IN_TRANSIT')))
      .returning({ id: schema.shipments.id })
    if (updated.length !== 1) throw new CustomsError('Only shipments in transit can be placed on hold')
    await tx.insert(schema.auditLog).values({ actorId: input.brokerId, action: 'shipment.hold', entity: 'shipment', entityId: input.shipmentId, data: { reason: input.reason.trim() } })
  })
}
