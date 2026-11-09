import { and, eq, like } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import { fromMinor, toMinor, type Currency } from '@/lib/money'
import { carrierPaid, escrowFunded, milestoneReleased } from '@/lib/ledger/entries'
import { normaliseRate, postTransaction } from '@/lib/ledger/post'
import { releaseBlocker, type MilestoneKind } from './rules'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>
export type RateFor = (currency: Currency) => Promise<string>

export class EscrowError extends Error {
  override name = 'EscrowError'
}

/**
 * Record the importer's freight payment into escrow (from a verified Stripe
 * webhook, or a simulated test payment). Idempotent per `reference`.
 * The amount and currency must match the shipment's freight exactly.
 */
export async function fundEscrow(
  db: Db,
  input: { shipmentId: string; amount: bigint; currency: Currency; reference: string; actorId?: string | null },
  deps: { rateFor: RateFor },
): Promise<{ status: 'FUNDED' | 'ALREADY_FUNDED'; transactionId?: string }> {
  return db.transaction(async (tx) => {
    const [shipment] = await tx.select().from(schema.shipments).where(eq(schema.shipments.id, input.shipmentId)).for('update')
    if (!shipment) throw new EscrowError('Shipment not found')
    const [booking] = await tx
      .select()
      .from(schema.escrowMilestones)
      .where(and(eq(schema.escrowMilestones.shipmentId, shipment.id), eq(schema.escrowMilestones.kind, 'BOOKING')))
    if (!booking) throw new EscrowError('Shipment has no escrow schedule')
    if (booking.status !== 'PENDING') return { status: 'ALREADY_FUNDED' as const }

    if (input.currency !== shipment.freightCurrency || input.amount !== toMinor(shipment.freightAmount))
      throw new EscrowError(
        `Payment ${fromMinor(input.amount)} ${input.currency} does not match freight ${shipment.freightAmount} ${shipment.freightCurrency}`,
      )
    if (shipment.status !== 'DRAFT') throw new EscrowError('Only draft shipments can be booked')

    const rate = await deps.rateFor(input.currency)
    const { transactionId } = await postTransaction(tx, {
      idempotencyKey: `${input.reference}:fund`,
      description: `Escrow funded at booking · ${shipment.trackingNumber}`,
      entries: escrowFunded({ amount: input.amount, currency: input.currency, fxRateToAed: rate }),
      shipmentId: shipment.id,
      postedBy: input.actorId ?? null,
    })
    await tx.update(schema.escrowMilestones).set({ status: 'LOCKED' }).where(eq(schema.escrowMilestones.id, booking.id))
    await tx.update(schema.shipments).set({ status: 'IN_TRANSIT', updatedAt: new Date() }).where(eq(schema.shipments.id, shipment.id))
    await tx.insert(schema.auditLog).values({
      actorId: input.actorId ?? null,
      action: 'escrow.fund',
      entity: 'shipment',
      entityId: shipment.id,
      data: { reference: input.reference, amount: fromMinor(input.amount), currency: input.currency, rate },
    })
    return { status: 'FUNDED' as const, transactionId }
  })
}

/** The FX rate the escrow was funded at, so releases net the escrow account to exactly zero in AED. */
async function fundingRate(db: Db, shipmentId: string): Promise<string | null> {
  const [row] = await db
    .select({ rate: schema.ledgerEntries.fxRateToAed })
    .from(schema.ledgerEntries)
    .innerJoin(schema.ledgerTransactions, eq(schema.ledgerTransactions.id, schema.ledgerEntries.transactionId))
    .where(and(eq(schema.ledgerTransactions.shipmentId, shipmentId), like(schema.ledgerTransactions.idempotencyKey, '%:fund')))
    .limit(1)
  return row ? normaliseRate(row.rate) : null
}

/**
 * Finance releases one milestone to the carrier: Escrow → Carrier Payable, then
 * a simulated payout (Carrier Payable → Cash). Safe to retry: a released
 * milestone returns its existing transaction.
 */
export async function releaseMilestone(
  db: Db,
  input: { milestoneId: string; actorId: string | null },
): Promise<{ status: 'RELEASED' | 'ALREADY_RELEASED'; kind: MilestoneKind; amount: string; currency: string }> {
  return db.transaction(async (tx) => {
    const [m] = await tx.select().from(schema.escrowMilestones).where(eq(schema.escrowMilestones.id, input.milestoneId)).for('update')
    if (!m) throw new EscrowError('Milestone not found')
    if (m.status === 'RELEASED') return { status: 'ALREADY_RELEASED' as const, kind: m.kind, amount: m.amount, currency: m.currency }

    const [shipment] = await tx.select().from(schema.shipments).where(eq(schema.shipments.id, m.shipmentId))
    const [booking] = await tx
      .select({ status: schema.escrowMilestones.status })
      .from(schema.escrowMilestones)
      .where(and(eq(schema.escrowMilestones.shipmentId, m.shipmentId), eq(schema.escrowMilestones.kind, 'BOOKING')))
    const blocker = releaseBlocker(m, shipment!.status, booking?.status !== 'PENDING')
    if (blocker) throw new EscrowError(blocker)

    const rate = await fundingRate(tx, m.shipmentId)
    if (!rate) throw new EscrowError('No funding transaction found for this shipment')
    const money = { amount: toMinor(m.amount), currency: m.currency as Currency, fxRateToAed: rate }

    const release = await postTransaction(tx, {
      idempotencyKey: `escrow:release:${m.id}`,
      description: `Escrow released (${m.kind}) · ${shipment!.trackingNumber}`,
      entries: milestoneReleased(money),
      shipmentId: m.shipmentId,
      postedBy: input.actorId,
    })
    await postTransaction(tx, {
      idempotencyKey: `escrow:payout:${m.id}`,
      description: `Carrier paid: ${shipment!.carrierName} · ${shipment!.trackingNumber}`,
      entries: carrierPaid(money),
      shipmentId: m.shipmentId,
      postedBy: input.actorId,
    })
    await tx
      .update(schema.escrowMilestones)
      .set({ status: 'RELEASED', releasedAt: new Date(), releasedBy: input.actorId, ledgerTransactionId: release.transactionId })
      .where(eq(schema.escrowMilestones.id, m.id))
    await tx.insert(schema.payouts).values({
      milestoneId: m.id,
      carrierName: shipment!.carrierName,
      amount: m.amount,
      currency: m.currency,
      status: 'SIMULATED',
      idempotencyKey: `payout:${m.id}`,
    })
    await tx.insert(schema.auditLog).values({
      actorId: input.actorId,
      action: 'escrow.release',
      entity: 'escrow_milestone',
      entityId: m.id,
      data: { kind: m.kind, amount: m.amount, currency: m.currency, rate },
    })
    return { status: 'RELEASED' as const, kind: m.kind, amount: m.amount, currency: m.currency }
  })
}

/** Coordinator confirms delivery; needs customs clearance and an uploaded proof of delivery. */
export async function markDelivered(db: Db, input: { shipmentId: string; actorId: string | null }): Promise<void> {
  await db.transaction(async (tx) => {
    const [shipment] = await tx.select().from(schema.shipments).where(eq(schema.shipments.id, input.shipmentId)).for('update')
    if (!shipment) throw new EscrowError('Shipment not found')
    if (shipment.status !== 'CLEARED') throw new EscrowError('Only shipments cleared by customs can be marked delivered')
    const [pod] = await tx
      .select({ id: schema.documents.id })
      .from(schema.documents)
      .where(and(eq(schema.documents.shipmentId, shipment.id), eq(schema.documents.type, 'PROOF_OF_DELIVERY')))
      .limit(1)
    if (!pod) throw new EscrowError('Upload the signed proof of delivery first')
    await tx.update(schema.shipments).set({ status: 'DELIVERED', updatedAt: new Date() }).where(eq(schema.shipments.id, shipment.id))
    await tx.insert(schema.auditLog).values({ actorId: input.actorId, action: 'shipment.deliver', entity: 'shipment', entityId: shipment.id, data: { proofOfDelivery: pod.id } })
  })
}
