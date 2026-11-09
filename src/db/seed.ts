/**
 * Demo data: chart of accounts, HS starter codes, FX rates and six shipments
 * covering every status (draft → delivered), with documents, line items,
 * invoices and escrow milestones. Safe to re-run: reference data is upserted
 * and demo shipments (NXT-DEMO-*) are created once, with ledger history posted
 * through the real engine (escrow funding, releases, payouts, invoices).
 *
 *   npm run db:seed
 */
import { createHash } from 'node:crypto'
import { eq, like, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from './schema'
import { ACCOUNTS, DEMO_SHIPMENTS, DEMO_TRACKING_PREFIX, ESCROW_SPLIT, FX_RATES, type DemoShipment } from './data/demo'
import { HS_CODES } from './data/hs-codes'
import HS_DATASET from './data/hs-codes.json'
import { applyBasisPoints, fromMinor, toMinor } from '../lib/money'
import { computeInvoice, lineTotal } from '../lib/tax/invoice'
import { carrierPaid, escrowFunded, invoiceIssued, milestoneReleased, type DraftEntry } from '../lib/ledger/entries'
import { postTransaction } from '../lib/ledger/post'

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

    // All 5,613 official HS subheadings (public-domain dataset), in batches.
    // Embeddings are left untouched here; `npm run hs:embed` fills them.
    for (let i = 0; i < HS_DATASET.length; i += 500) {
      const batch = HS_DATASET.slice(i, i + 500).map((h) => ({ ...h, chapter: Number(h.code.slice(0, 2)) }))
      await tx
        .insert(schema.hsCodes)
        .values(batch)
        .onConflictDoUpdate({
          target: schema.hsCodes.code,
          set: {
            description: sql`excluded.description`,
            heading: sql`excluded.heading`,
            section: sql`excluded.section`,
            chapter: sql`excluded.chapter`,
            dutyRateBp: sql`excluded.duty_rate_bp`,
            restricted: sql`excluded.restricted`,
          },
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

    // ---- demo shipments: created once. Their ledger history is append-only,
    // so a re-run keeps them rather than deleting and recreating them. ----
    const existing = await tx.$count(schema.shipments, like(schema.shipments.trackingNumber, `${DEMO_TRACKING_PREFIX}%`))
    const summary = { accounts: ACCOUNTS.length, hsCodes: HS_DATASET.length, fxRates: FX_RATES.length, demoUsersLinked: demoProfiles.length }
    if (existing > 0) return { ...summary, shipments: existing, ledgerTransactions: await tx.$count(schema.ledgerTransactions), skipped: true }

    const now = Date.now()
    let ledgerTransactions = 0
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

      // Every ledger posting goes through the real engine, with namespaced keys.
      const rate = fx[s.currency]!
      const money = (amount: bigint) => ({ amount, currency: s.currency, fxRateToAed: rate })
      const post = async (event: string, description: string, entries: DraftEntry[], invoiceId?: string) => {
        const { transactionId } = await postTransaction(tx, {
          idempotencyKey: `seed:ledger:${s.trackingNumber}:${event}`,
          description: `${description} · ${s.trackingNumber}`,
          entries,
          shipmentId,
          invoiceId: invoiceId ?? null,
          postedBy: userFor('finance'),
        })
        ledgerTransactions++
        return transactionId
      }

      // Invoice once customs has cleared.
      if (r >= 3) {
        const dutyBp = Object.fromEntries(HS_CODES.map((h) => [h.code, h.dutyRateBp]))
        const totals = computeInvoice(
          s.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, dutyRateBp: dutyBp[l.hsCode] ?? 500 })),
          s.treatment,
          fx[s.currency]!,
        )
        const [invoice] = await tx.insert(schema.invoices).values({
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
        }).returning({ id: schema.invoices.id })
        await post('invoice', 'Invoice issued', invoiceIssued(totals, s.currency, rate), invoice!.id)
      }

      // Escrow: amounts sum exactly to the freight (last milestone takes the remainder).
      const freight = toMinor(s.freightAmount)
      let allocated = 0n
      const milestones = await tx.insert(schema.escrowMilestones).values(
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
      ).returning()

      // Ledger history: the importer funds the full freight into escrow at booking;
      // each released milestone moves money to the carrier, who is then paid out.
      if (r >= 1) await post('fund', 'Escrow funded at booking', escrowFunded(money(freight)))
      for (const m of milestones.filter((x) => x.status === 'RELEASED')) {
        const amount = toMinor(m.amount)
        const releaseTx = await post(`release:${m.kind}`, `Escrow released (${m.kind})`, milestoneReleased(money(amount)))
        await tx.update(schema.escrowMilestones).set({ ledgerTransactionId: releaseTx }).where(eq(schema.escrowMilestones.id, m.id))
        const payoutKey = `seed:payout:${s.trackingNumber}:${m.kind}`
        await post(`payout:${m.kind}`, `Carrier paid: ${s.carrierName}`, carrierPaid(money(amount)))
        await tx.insert(schema.payouts).values({ milestoneId: m.id, carrierName: s.carrierName, amount: m.amount, currency: s.currency, status: 'SIMULATED', idempotencyKey: payoutKey })
      }
    }

    const shipments = await tx.$count(schema.shipments, like(schema.shipments.trackingNumber, `${DEMO_TRACKING_PREFIX}%`))
    return { ...summary, shipments, ledgerTransactions, skipped: false }
  })
}

