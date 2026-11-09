import 'server-only'
import { asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import * as schema from '@/db/schema'

export async function listShipments() {
  return db()
    .select({
      id: schema.shipments.id,
      trackingNumber: schema.shipments.trackingNumber,
      mode: schema.shipments.mode,
      status: schema.shipments.status,
      shipperName: schema.shipments.shipperName,
      consigneeName: schema.shipments.consigneeName,
      originPort: schema.shipments.originPort,
      destinationPort: schema.shipments.destinationPort,
      createdAt: schema.shipments.createdAt,
      documents: sql<number>`(select count(*)::int from ${schema.documents} d where d.shipment_id = ${schema.shipments.id})`,
      discrepancies: sql<number>`(select count(*)::int from ${schema.documents} d where d.shipment_id = ${schema.shipments.id} and d.has_discrepancy)`,
    })
    .from(schema.shipments)
    .orderBy(desc(schema.shipments.createdAt))
    .limit(100)
}

export async function getShipment(id: string) {
  const [shipment] = await db().select().from(schema.shipments).where(eq(schema.shipments.id, id))
  if (!shipment) return null
  const [documents, lineItems] = await Promise.all([
    db().select().from(schema.documents).where(eq(schema.documents.shipmentId, id)).orderBy(desc(schema.documents.createdAt)),
    db().select().from(schema.lineItems).where(eq(schema.lineItems.shipmentId, id)).orderBy(asc(schema.lineItems.lineNo)),
  ])
  return { shipment, documents, lineItems }
}
