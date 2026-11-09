import { and, asc, eq, gte, lt, like, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import type { InvoiceRow, JournalLine } from './build'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

/** Ledger lines in a date range [from, to), with account names, in AED. */
export async function journalLines(db: Db, from: Date, to: Date): Promise<JournalLine[]> {
  const rows = await db
    .select({
      transactionId: schema.ledgerTransactions.id,
      postedAt: schema.ledgerTransactions.postedAt,
      description: schema.ledgerTransactions.description,
      reference: schema.ledgerTransactions.idempotencyKey,
      accountCode: schema.ledgerEntries.accountCode,
      accountName: schema.accounts.name,
      direction: schema.ledgerEntries.direction,
      amountAed: schema.ledgerEntries.amountAed,
    })
    .from(schema.ledgerEntries)
    .innerJoin(schema.ledgerTransactions, eq(schema.ledgerTransactions.id, schema.ledgerEntries.transactionId))
    .innerJoin(schema.accounts, eq(schema.accounts.code, schema.ledgerEntries.accountCode))
    .where(and(gte(schema.ledgerTransactions.postedAt, from), lt(schema.ledgerTransactions.postedAt, to)))
    .orderBy(asc(schema.ledgerTransactions.postedAt))
  return rows
}

export async function invoiceRows(db: Db, from: Date, to: Date): Promise<InvoiceRow[]> {
  return db
    .select({
      invoiceNumber: schema.invoices.invoiceNumber,
      issuedAt: schema.invoices.issuedAt,
      trackingNumber: schema.shipments.trackingNumber,
      consigneeName: schema.shipments.consigneeName,
      consigneeTrn: schema.shipments.consigneeTrn,
      taxTreatment: schema.invoices.taxTreatment,
      currency: schema.invoices.currency,
      fxRateToAed: schema.invoices.fxRateToAed,
      subtotal: schema.invoices.subtotal,
      dutyAmount: schema.invoices.dutyAmount,
      vatAmount: schema.invoices.vatAmount,
      total: schema.invoices.total,
      totalAed: schema.invoices.totalAed,
    })
    .from(schema.invoices)
    .innerJoin(schema.shipments, eq(schema.shipments.id, schema.invoices.shipmentId))
    .where(and(gte(schema.invoices.issuedAt, from), lt(schema.invoices.issuedAt, to)))
    .orderBy(asc(schema.invoices.issuedAt))
}

/** Freight funded into escrow (AED, at the funding rate), dated by funding. */
export async function fundedFreight(db: Db, since: Date) {
  return db
    .select({ at: schema.ledgerTransactions.postedAt, amountAed: schema.ledgerEntries.amountAed, carrier: schema.shipments.carrierName })
    .from(schema.ledgerEntries)
    .innerJoin(schema.ledgerTransactions, eq(schema.ledgerTransactions.id, schema.ledgerEntries.transactionId))
    .innerJoin(schema.shipments, eq(schema.shipments.id, schema.ledgerTransactions.shipmentId))
    .where(
      and(
        like(schema.ledgerTransactions.idempotencyKey, '%:fund'),
        eq(schema.ledgerEntries.direction, 'CREDIT'), // the escrow side
        gte(schema.ledgerTransactions.postedAt, since),
      ),
    )
}

export async function shipmentStatusCounts(db: Db) {
  return db
    .select({ status: schema.shipments.status, count: sql<number>`count(*)::int` })
    .from(schema.shipments)
    .groupBy(schema.shipments.status)
}
