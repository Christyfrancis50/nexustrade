import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { authenticatedRole } from 'drizzle-orm/supabase'
import { ANY_ROLE, createdAt, currency, money, roleIn } from './_shared'
import { profiles } from './profiles'

export const shipmentStatus = pgEnum('shipment_status', ['DRAFT', 'IN_TRANSIT', 'CUSTOMS_HOLD', 'CLEARED', 'DELIVERED'])
export const transportMode = pgEnum('transport_mode', ['SEA', 'AIR', 'ROAD'])
export const documentType = pgEnum('document_type', [
  'BILL_OF_LADING',
  'AIRWAY_BILL',
  'PACKING_LIST',
  'COMMERCIAL_INVOICE',
  'PROOF_OF_DELIVERY',
])
export const extractionStatus = pgEnum('extraction_status', ['PENDING', 'EXTRACTED', 'FAILED', 'REVIEWED'])
export const hsStatus = pgEnum('hs_status', ['UNCLASSIFIED', 'SUGGESTED', 'APPROVED', 'OVERRIDDEN'])

/** 15-digit UAE Tax Registration Number, or null for non-UAE parties. */
const trn = () => text()

export const shipments = pgTable(
  'shipments',
  {
    id: uuid().defaultRandom().primaryKey(),
    trackingNumber: text().notNull().unique(),
    mode: transportMode().notNull(),
    shipperName: text().notNull(),
    shipperTrn: trn(),
    consigneeName: text().notNull(),
    consigneeTrn: trn(),
    carrierName: text().notNull(),
    originPort: text().notNull(), // UN/LOCODE, e.g. CNSHA
    destinationPort: text().notNull(), // e.g. AEJEA (Jebel Ali)
    freeZone: boolean().default(false).notNull(), // consignee in a designated zone (JAFZA etc.)
    status: shipmentStatus().default('DRAFT').notNull(),
    freightAmount: money().notNull(),
    freightCurrency: currency().default('AED').notNull(),
    etd: timestamp({ withTimezone: true }),
    eta: timestamp({ withTimezone: true }),
    createdBy: uuid().references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check('shipments_locode_chk', sql`${t.originPort} ~ '^[A-Z]{5}$' and ${t.destinationPort} ~ '^[A-Z]{5}$'`),
    check('shipments_trn_chk', sql`(${t.shipperTrn} is null or ${t.shipperTrn} ~ '^[0-9]{15}$') and (${t.consigneeTrn} is null or ${t.consigneeTrn} ~ '^[0-9]{15}$')`),
    check('shipments_freight_positive', sql`${t.freightAmount} > 0`),
    index('shipments_status_idx').on(t.status),
    pgPolicy('shipments_select', { for: 'select', to: authenticatedRole, using: ANY_ROLE }),
    pgPolicy('shipments_insert', { for: 'insert', to: authenticatedRole, withCheck: roleIn('coordinator') }),
    pgPolicy('shipments_update', { for: 'update', to: authenticatedRole, using: roleIn('coordinator', 'broker'), withCheck: roleIn('coordinator', 'broker') }),
  ],
).enableRLS()

export const documents = pgTable(
  'documents',
  {
    id: uuid().defaultRandom().primaryKey(),
    shipmentId: uuid()
      .notNull()
      .references(() => shipments.id, { onDelete: 'cascade' }),
    type: documentType().notNull(),
    documentNumber: text(),
    storagePath: text().notNull(), // private bucket key, served via signed URLs
    originalFilename: text().notNull(),
    mimeType: text().notNull(),
    sizeBytes: integer().notNull(),
    sha256: text().notNull(),
    extractionStatus: extractionStatus().default('PENDING').notNull(),
    extracted: jsonb(), // validated AI output (Module A)
    statedTotal: money(), // total printed on the document
    computedTotal: money(), // total we recomputed from line items
    hasDiscrepancy: boolean().default(false).notNull(),
    uploadedBy: uuid().references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    check('documents_mime_chk', sql`${t.mimeType} in ('application/pdf', 'image/png', 'image/jpeg')`),
    check('documents_size_chk', sql`${t.sizeBytes} > 0 and ${t.sizeBytes} <= 10485760`),
    index('documents_shipment_idx').on(t.shipmentId),
    unique('documents_shipment_sha_uq').on(t.shipmentId, t.sha256),
    pgPolicy('documents_select', { for: 'select', to: authenticatedRole, using: ANY_ROLE }),
    pgPolicy('documents_insert', { for: 'insert', to: authenticatedRole, withCheck: roleIn('coordinator') }),
  ],
).enableRLS()

export const lineItems = pgTable(
  'line_items',
  {
    id: uuid().defaultRandom().primaryKey(),
    shipmentId: uuid()
      .notNull()
      .references(() => shipments.id, { onDelete: 'cascade' }),
    documentId: uuid().references(() => documents.id, { onDelete: 'set null' }),
    lineNo: integer().notNull(),
    description: text().notNull(),
    quantity: numeric({ precision: 14, scale: 3 }).notNull(),
    unit: text().notNull(), // PCS, KG, CTN…
    unitPrice: money().notNull(),
    currency: currency().notNull(),
    weightKg: numeric({ precision: 12, scale: 3 }),
    volumeCbm: numeric({ precision: 12, scale: 3 }),
    hsCode: text(),
    hsStatus: hsStatus().default('UNCLASSIFIED').notNull(),
    restricted: boolean().default(false).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check('line_items_qty_positive', sql`${t.quantity} > 0`),
    check('line_items_price_nonneg', sql`${t.unitPrice} >= 0`),
    check('line_items_hs_format', sql`${t.hsCode} is null or ${t.hsCode} ~ '^[0-9]{6,8}$'`),
    unique('line_items_shipment_line_uq').on(t.shipmentId, t.lineNo),
    index('line_items_hs_idx').on(t.hsCode),
    pgPolicy('line_items_select', { for: 'select', to: authenticatedRole, using: ANY_ROLE }),
    pgPolicy('line_items_insert', { for: 'insert', to: authenticatedRole, withCheck: roleIn('coordinator') }),
    pgPolicy('line_items_update', { for: 'update', to: authenticatedRole, using: roleIn('coordinator', 'broker'), withCheck: roleIn('coordinator', 'broker') }),
  ],
).enableRLS()

export type Shipment = typeof shipments.$inferSelect
export type LineItem = typeof lineItems.$inferSelect
