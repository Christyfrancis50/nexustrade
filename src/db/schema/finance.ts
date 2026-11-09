import { sql } from 'drizzle-orm'
import {
  bigserial,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { authenticatedRole } from 'drizzle-orm/supabase'
import { ANY_ROLE, createdAt, currency, money, rate, roleIn } from './_shared'
import { profiles } from './profiles'
import { shipments } from './shipments'

/*
 * Write model: the app writes money rows only from Server Actions (after requireRole)
 * over the server's DB connection. RLS here grants READ access by role and no
 * write policies, so the public anon/authenticated API can never mutate money.
 */

export const accountType = pgEnum('account_type', ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'])
export const taxTreatment = pgEnum('tax_treatment', ['STANDARD', 'ZERO_RATED', 'EXEMPT'])
export const entryDirection = pgEnum('entry_direction', ['DEBIT', 'CREDIT'])
export const milestoneKind = pgEnum('milestone_kind', ['BOOKING', 'CUSTOMS_CLEARED', 'DELIVERED'])
export const milestoneStatus = pgEnum('milestone_status', ['PENDING', 'LOCKED', 'RELEASED'])
export const payoutStatus = pgEnum('payout_status', ['SIMULATED', 'PAID', 'FAILED'])

export const accounts = pgTable(
  'accounts',
  {
    code: text().primaryKey(), // e.g. 1100
    name: text().notNull(),
    type: accountType().notNull(),
  },
  () => [pgPolicy('accounts_select', { for: 'select', to: authenticatedRole, using: ANY_ROLE })],
).enableRLS()

export const invoices = pgTable(
  'invoices',
  {
    id: uuid().defaultRandom().primaryKey(),
    shipmentId: uuid()
      .notNull()
      .references(() => shipments.id, { onDelete: 'restrict' }),
    invoiceNumber: text().notNull().unique(),
    taxTreatment: taxTreatment().notNull(),
    currency: currency().notNull(),
    subtotal: money().notNull(),
    vatRateBp: integer().notNull(), // 500 = 5%
    vatAmount: money().notNull(),
    dutyAmount: money().default('0').notNull(),
    total: money().notNull(),
    fxRateToAed: rate().notNull(),
    totalAed: money().notNull(),
    idempotencyKey: text().notNull().unique(),
    issuedBy: uuid().references(() => profiles.id, { onDelete: 'set null' }),
    issuedAt: createdAt(),
  },
  (t) => [
    check('invoices_total_consistent', sql`${t.total} = ${t.subtotal} + ${t.vatAmount} + ${t.dutyAmount}`),
    check('invoices_vat_rate', sql`${t.vatRateBp} in (0, 500)`),
    check('invoices_treatment_rate', sql`(${t.taxTreatment} = 'STANDARD') = (${t.vatRateBp} = 500)`),
    check('invoices_nonneg', sql`${t.subtotal} >= 0 and ${t.vatAmount} >= 0 and ${t.dutyAmount} >= 0`),
    check('invoices_fx_positive', sql`${t.fxRateToAed} > 0`),
    index('invoices_shipment_idx').on(t.shipmentId),
    pgPolicy('invoices_select', { for: 'select', to: authenticatedRole, using: ANY_ROLE }),
  ],
).enableRLS()

/** Header for a balanced group of ledger entries. Append-only (DB trigger). */
export const ledgerTransactions = pgTable(
  'ledger_transactions',
  {
    id: uuid().defaultRandom().primaryKey(),
    description: text().notNull(),
    shipmentId: uuid().references(() => shipments.id, { onDelete: 'restrict' }),
    invoiceId: uuid().references(() => invoices.id, { onDelete: 'restrict' }),
    idempotencyKey: text().notNull().unique(),
    reversesId: uuid(), // set on a correcting (reversal) transaction
    postedBy: uuid().references(() => profiles.id, { onDelete: 'set null' }),
    postedAt: createdAt(),
  },
  (t) => [
    index('ledger_tx_shipment_idx').on(t.shipmentId),
    pgPolicy('ledger_tx_select', { for: 'select', to: authenticatedRole, using: roleIn('finance') }),
  ],
).enableRLS()

/**
 * Double-entry lines. Append-only, and every transaction must balance in AED
 * (both enforced by DB triggers in migration 0004). Balances are always derived.
 */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid().defaultRandom().primaryKey(),
    transactionId: uuid()
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: 'restrict' }),
    accountCode: text()
      .notNull()
      .references(() => accounts.code),
    direction: entryDirection().notNull(),
    amount: money().notNull(), // in `currency`
    currency: currency().notNull(),
    fxRateToAed: rate().notNull(),
    amountAed: money().notNull(), // base-currency amount used for balancing
    createdAt: createdAt(),
  },
  (t) => [
    check('ledger_entries_amount_positive', sql`${t.amount} > 0 and ${t.amountAed} > 0`),
    check('ledger_entries_fx_positive', sql`${t.fxRateToAed} > 0`),
    check('ledger_entries_aed_rate', sql`${t.currency} <> 'AED' or ${t.fxRateToAed} = 1`),
    index('ledger_entries_tx_idx').on(t.transactionId),
    index('ledger_entries_account_idx').on(t.accountCode),
    pgPolicy('ledger_entries_select', { for: 'select', to: authenticatedRole, using: roleIn('finance') }),
  ],
).enableRLS()

export const escrowMilestones = pgTable(
  'escrow_milestones',
  {
    id: uuid().defaultRandom().primaryKey(),
    shipmentId: uuid()
      .notNull()
      .references(() => shipments.id, { onDelete: 'cascade' }),
    kind: milestoneKind().notNull(),
    percentBp: integer().notNull(), // 1000 = 10%
    amount: money().notNull(),
    currency: currency().notNull(),
    status: milestoneStatus().default('PENDING').notNull(),
    ledgerTransactionId: uuid().references(() => ledgerTransactions.id),
    releasedBy: uuid().references(() => profiles.id, { onDelete: 'set null' }),
    releasedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('escrow_shipment_kind_uq').on(t.shipmentId, t.kind),
    check('escrow_percent_range', sql`${t.percentBp} > 0 and ${t.percentBp} <= 10000`),
    check('escrow_released_consistent', sql`(${t.status} = 'RELEASED') = (${t.releasedAt} is not null)`),
    pgPolicy('escrow_select', { for: 'select', to: authenticatedRole, using: ANY_ROLE }),
  ],
).enableRLS()

export const payouts = pgTable(
  'payouts',
  {
    id: uuid().defaultRandom().primaryKey(),
    milestoneId: uuid()
      .notNull()
      .references(() => escrowMilestones.id, { onDelete: 'restrict' }),
    carrierName: text().notNull(),
    amount: money().notNull(),
    currency: currency().notNull(),
    status: payoutStatus().default('SIMULATED').notNull(),
    externalRef: text(), // e.g. Stripe test transfer id
    idempotencyKey: text().notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [
    check('payouts_amount_positive', sql`${t.amount} > 0`),
    pgPolicy('payouts_select', { for: 'select', to: authenticatedRole, using: roleIn('finance') }),
  ],
).enableRLS()

export const fxRates = pgTable(
  'fx_rates',
  {
    id: uuid().defaultRandom().primaryKey(),
    currency: currency().notNull(),
    rateToAed: rate().notNull(),
    source: text().notNull(),
    asOf: timestamp({ withTimezone: true }).notNull(),
    fetchedAt: createdAt(),
  },
  (t) => [
    unique('fx_rates_currency_asof_uq').on(t.currency, t.asOf),
    check('fx_rates_positive', sql`${t.rateToAed} > 0`),
    pgPolicy('fx_rates_select', { for: 'select', to: authenticatedRole, using: ANY_ROLE }),
  ],
).enableRLS()

/** Stored responses for Idempotency-Key replays. Server-only: RLS on, no policies. */
export const idempotencyKeys = pgTable('idempotency_keys', {
  key: text().primaryKey(),
  scope: text().notNull(), // e.g. 'invoice.create'
  requestHash: text().notNull(),
  response: jsonb(),
  createdAt: createdAt(),
}).enableRLS()

/** Append-only audit trail (DB trigger). Finance can read. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    actorId: uuid().references(() => profiles.id, { onDelete: 'set null' }),
    action: text().notNull(), // e.g. 'escrow.release'
    entity: text().notNull(),
    entityId: text().notNull(),
    data: jsonb(),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_entity_idx').on(t.entity, t.entityId),
    pgPolicy('audit_select', { for: 'select', to: authenticatedRole, using: roleIn('finance') }),
  ],
).enableRLS()

export type Invoice = typeof invoices.$inferSelect
export type LedgerEntry = typeof ledgerEntries.$inferSelect
