/**
 * Demo data: chart of accounts, HS starter codes, FX rates and six shipments
 * covering every status (draft → delivered), with documents, line items,
 * invoices and escrow milestones. Safe to re-run: reference data is upserted
 * and demo shipments (NXT-DEMO-*) are replaced.
 *
 *   npm run db:seed
 *
 * Ledger history is added in Phase 4, once the posting engine exists.
 */
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { inArray, like } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from './schema'
import { ACCOUNTS, DEMO_SHIPMENTS, DEMO_TRACKING_PREFIX, ESCROW_SPLIT, FX_RATES, type DemoShipment } from './data/demo'
import { HS_CODES } from './data/hs-codes'
import { applyBasisPoints, fromMinor, toMinor } from '../lib/money'
import { computeInvoice, lineTotal } from '../lib/tax/invoice'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

const FX_AS_OF = new Date('2026-11-01T00:00:00Z')
const DAY = 86_400_000
const rank: Record<DemoShipment['status'], number> = { DRAFT: 0, IN_TRANSIT: 1, CUSTOMS_HOLD: 2, CLEARED: 3, DELIVERED: 4 }
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

export async function seed(db: Db) {
  return db.transaction(async (tx) => {
    // ---- reference data (upserts) ----
    for (const a of ACCOUNTS)
      await tx.insert(schema.accounts).values(a).onConflictDoUpdate({ target: schema.accounts.code, set: { name: a.name, type: a.type } })

    for (const h of HS_CODES) {
      const row = { code: h.code, description: h.description, chapter: Number(h.code.slice(0, 2)), dutyRateBp: h.dutyRateBp, restricted: h.restricted ?? false }
      await tx.insert(schema.hsCodes).values(row).onConflictDoUpdate({
        target: schema.hsCodes.code,
        set: { description: row.description, chapter: row.chapter, dutyRateBp: row.dutyRateBp, restricted: row.restricted },
      })
    }

    for (const f of FX_RATES)
      await tx.insert(schema.fxRates).values({ ...f, source: 'seed (indicative)', asOf: FX_AS_OF }).onConflictDoNothing()
    const fx = Object.fromEntries(FX_RATES.map((f) => [f.currency, f.rateToAed]))

    // ---- demo users (optional: created by `npm run auth:demo-users`) ----
    const demoProfiles = await tx
      .select({ id: schema.profiles.id, role: schema.profiles.role })
      .from(schema.profiles)
      .where(like(schema.profiles.email, '%@nexustrade.test'))
    const userFor = (role: string) => demoProfiles.find((p) => p.role === role)?.id ?? null

    // ---- replace demo shipments ----
    const old = await tx.select({ id: schema.shipments.id }).from(schema.shipments).where(like(schema.shipments.trackingNumber, `${DEMO_TRACKING_PREFIX}%`))
    if (old.length) {
      const ids = old.map((o) => o.id)
      await tx.delete(schema.invoices).where(inArray(schema.invoices.shipmentId, ids))
      await tx.delete(schema.shipments).where(inArray(schema.shipments.id, ids)) // cascades docs, lines, escrow
    }

    const now = Date.now()
    for (const s of DEMO_SHIPMENTS) {
      const created = new Date(now - s.daysAgo * DAY)
      const r = rank[s.status]

      const [shipment] = await tx
        .insert(schema.shipments)
        .values({
          trackingNumber: s.trackingNumber,
          mode: s.mode,
          status: s.status,
          shipperName: s.shipperName,
          shipperTrn: s.shipperTrn,
          consigneeName: s.consigneeName,
          consigneeTrn: s.consigneeTrn,
          carrierName: s.carrierName,
          originPort: s.originPort,
          destinationPort: s.destinationPort,
          freeZone: s.freeZone,
          freightAmount: s.freightAmount,
          freightCurrency: s.currency,
          etd: created,
          eta: new Date(created.getTime() + (s.mode === 'AIR' ? 2 : 21) * DAY),
          createdBy: userFor('coordinator'),
          createdAt: created,
          updatedAt: created,
        })
        .returning({ id: schema.shipments.id })
      const shipmentId = shipment!.id

      // Commercial invoice document. Shipment 0003 has a stated total that doesn't
      // match its line items, which is why it sits on customs hold.
      const computed = s.lines.reduce((sum, l) => sum + lineTotal(l.quantity, l.unitPrice), 0n)
      const stated = s.status === 'CUSTOMS_HOLD' ? computed + toMinor('1450.00') : computed
      const docs: Array<typeof schema.documents.$inferInsert> = [
        {
          shipmentId,
          type: 'COMMERCIAL_INVOICE',
          documentNumber: `CI-${s.trackingNumber.slice(-4)}`,
          storagePath: `seed/${s.trackingNumber}/commercial-invoice.pdf`,
          originalFilename: 'commercial-invoice.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 182_400,
          sha256: sha(`${s.trackingNumber}:ci`),
          extractionStatus: r === 0 ? 'PENDING' : r >= 3 ? 'REVIEWED' : 'EXTRACTED',
          statedTotal: r === 0 ? null : fromMinor(stated),
          computedTotal: r === 0 ? null : fromMinor(computed),
          hasDiscrepancy: stated !== computed,
          uploadedBy: userFor('coordinator'),
          createdAt: created,
        },
      ]
      if (r >= 1)
        docs.push({
          shipmentId,
          type: s.mode === 'AIR' ? 'AIRWAY_BILL' : 'BILL_OF_LADING',
          documentNumber: `${s.mode === 'AIR' ? 'AWB' : 'BL'}-${s.trackingNumber.slice(-4)}`,
          storagePath: `seed/${s.trackingNumber}/transport-document.pdf`,
          originalFilename: s.mode === 'AIR' ? 'airway-bill.pdf' : 'bill-of-lading.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 96_300,
          sha256: sha(`${s.trackingNumber}:transport`),
          extractionStatus: 'REVIEWED',
          uploadedBy: userFor('coordinator'),
          createdAt: created,
        })
      if (r === 4)
        docs.push({
          shipmentId,
          type: 'PROOF_OF_DELIVERY',
          documentNumber: `POD-${s.trackingNumber.slice(-4)}`,
          storagePath: `seed/${s.trackingNumber}/proof-of-delivery.jpg`,
          originalFilename: 'signed-pod.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 412_000,
          sha256: sha(`${s.trackingNumber}:pod`),
          extractionStatus: 'REVIEWED',
          uploadedBy: userFor('coordinator'),
          createdAt: created,
        })
      const insertedDocs = await tx.insert(schema.documents).values(docs).returning({ id: schema.documents.id, type: schema.documents.type })
      const ciId = insertedDocs.find((d) => d.type === 'COMMERCIAL_INVOICE')!.id

      // Line items: unclassified → AI-suggested → broker-approved as the shipment progresses.
      await tx.insert(schema.lineItems).values(
        s.lines.map((l, i) => ({
          shipmentId,
          documentId: ciId,
          lineNo: i + 1,
          description: l.description,
          quantity: l.quantity,
          unit: l.unit,
          unitPrice: l.unitPrice,
          currency: s.currency,
          weightKg: l.weightKg,
          hsCode: r === 0 ? null : l.hsCode,
          hsStatus: r === 0 ? ('UNCLASSIFIED' as const) : r >= 3 ? ('APPROVED' as const) : ('SUGGESTED' as const),
          createdAt: created,
        })),
      )

      // Invoice once customs has cleared.
      if (r >= 3) {
        const dutyBp = Object.fromEntries(HS_CODES.map((h) => [h.code, h.dutyRateBp]))
        const totals = computeInvoice(
          s.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, dutyRateBp: dutyBp[l.hsCode] ?? 500 })),
          s.treatment,
          fx[s.currency]!,
        )
        await tx.insert(schema.invoices).values({
          shipmentId,
          invoiceNumber: `INV-2026-${s.trackingNumber.slice(-4)}`,
          taxTreatment: s.treatment,
          currency: s.currency,
          subtotal: fromMinor(totals.subtotal),
          vatRateBp: Number(totals.vatRateBp),
          vatAmount: fromMinor(totals.vat),
          dutyAmount: fromMinor(totals.duty),
          total: fromMinor(totals.total),
          fxRateToAed: fx[s.currency]!,
          totalAed: fromMinor(totals.totalAed),
          idempotencyKey: `seed:invoice:${s.trackingNumber}`,
          issuedBy: userFor('finance'),
          issuedAt: new Date(created.getTime() + 14 * DAY),
        })
      }

      // Escrow: amounts sum exactly to the freight (last milestone takes the remainder).
      const freight = toMinor(s.freightAmount)
      let allocated = 0n
      await tx.insert(schema.escrowMilestones).values(
        ESCROW_SPLIT.map((m, i) => {
          const amount = i === ESCROW_SPLIT.length - 1 ? freight - allocated : applyBasisPoints(freight, BigInt(m.percentBp))
          allocated += amount
          const released = r === 4 || (r === 3 && m.kind === 'CUSTOMS_CLEARED')
          const locked = !released && r >= 1 && m.kind === 'BOOKING'
          return {
            shipmentId,
            kind: m.kind,
            percentBp: m.percentBp,
            amount: fromMinor(amount),
            currency: s.currency,
            status: released ? ('RELEASED' as const) : locked ? ('LOCKED' as const) : ('PENDING' as const),
            releasedAt: released ? new Date(created.getTime() + 20 * DAY) : null,
            releasedBy: released ? userFor('finance') : null,
          }
        }),
      )
    }

    const shipmentCount = await tx.$count(schema.shipments, like(schema.shipments.trackingNumber, `${DEMO_TRACKING_PREFIX}%`))
    return { accounts: ACCOUNTS.length, hsCodes: HS_CODES.length, fxRates: FX_RATES.length, shipments: shipmentCount, demoUsersLinked: demoProfiles.length }
  })
}

// ---- CLI entry: `npm run db:seed` ----
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { drizzle } = await import('drizzle-orm/postgres-js')
  const postgres = (await import('postgres')).default
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env first.')
  const client = postgres(url, { prepare: false, max: 1 })
  try {
    const summary = await seed(drizzle(client, { schema, casing: 'snake_case' }))
    console.log('Seeded:', summary)
  } finally {
    await client.end()
  }
}
