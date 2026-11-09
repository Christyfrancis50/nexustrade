import 'server-only'
import { asc, desc, inArray } from 'drizzle-orm'
import { db } from '@/db'
import * as schema from '@/db/schema'
import { applyBasisPoints, formatMoney, type Currency } from '@/lib/money'
import { lineTotal } from '@/lib/tax/invoice'
import { suggestHsCodes, type Suggestion } from './classify'
import { getEmbedder } from './config'
import { clearanceCheck, type ClearanceCheck } from './review'

export type QueueLine = {
  id: string
  lineNo: number
  description: string
  quantity: string
  unit: string
  value: string
  hsCode: string | null
  hsStatus: string
  confidence: number | null
  restricted: boolean
  current: { description: string; dutyRateBp: number; restricted: boolean; dutyEstimate: string } | null
  alternatives: Suggestion[]
}

export type QueueShipment = {
  id: string
  trackingNumber: string
  status: string
  route: string
  consigneeName: string
  lines: QueueLine[]
  clearance: ClearanceCheck
}

/** Shipments awaiting customs work, with live top-3 HS suggestions per open line. */
export async function brokerQueue(): Promise<QueueShipment[]> {
  const conn = db()
  const embedder = await getEmbedder()
  const shipments = await conn
    .select()
    .from(schema.shipments)
    .where(inArray(schema.shipments.status, ['IN_TRANSIT', 'CUSTOMS_HOLD']))
    .orderBy(desc(schema.shipments.status), asc(schema.shipments.createdAt))
  if (shipments.length === 0) return []

  const lines = await conn
    .select()
    .from(schema.lineItems)
    .where(inArray(schema.lineItems.shipmentId, shipments.map((s) => s.id)))
    .orderBy(asc(schema.lineItems.lineNo))
  const codes = [...new Set(lines.flatMap((l) => (l.hsCode ? [l.hsCode] : [])))]
  const hs = codes.length ? await conn.select().from(schema.hsCodes).where(inArray(schema.hsCodes.code, codes)) : []
  const byCode = new Map(hs.map((h) => [h.code, h]))

  return Promise.all(
    shipments.map(async (s) => ({
      id: s.id,
      trackingNumber: s.trackingNumber,
      status: s.status,
      route: `${s.originPort} → ${s.destinationPort}`,
      consigneeName: s.consigneeName,
      clearance: await clearanceCheck(conn, s.id),
      lines: await Promise.all(
        lines
          .filter((l) => l.shipmentId === s.id)
          .map(async (l): Promise<QueueLine> => {
            const value = lineTotal(l.quantity, l.unitPrice)
            const h = l.hsCode ? byCode.get(l.hsCode) : undefined
            const open = l.hsStatus === 'UNCLASSIFIED' || l.hsStatus === 'SUGGESTED'
            return {
              id: l.id,
              lineNo: l.lineNo,
              description: l.description,
              quantity: l.quantity,
              unit: l.unit,
              value: formatMoney(value, l.currency as Currency),
              hsCode: l.hsCode,
              hsStatus: l.hsStatus,
              confidence: l.hsConfidence === null ? null : Number(l.hsConfidence),
              restricted: l.restricted,
              current: h
                ? {
                    description: h.description,
                    dutyRateBp: h.dutyRateBp,
                    restricted: h.restricted,
                    dutyEstimate: formatMoney(applyBasisPoints(value, BigInt(h.dutyRateBp)), l.currency as Currency),
                  }
                : null,
              alternatives: open ? await suggestHsCodes(conn, l.description, { embedder, limit: 3 }) : [],
            }
          }),
      ),
    })),
  )
}
