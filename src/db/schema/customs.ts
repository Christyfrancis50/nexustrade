import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, numeric, pgEnum, pgPolicy, pgTable, text, uuid, vector } from 'drizzle-orm/pg-core'
import { authenticatedRole } from 'drizzle-orm/supabase'
import { ANY_ROLE, createdAt, roleIn } from './_shared'
import { lineItems } from './shipments'
import { profiles } from './profiles'

/** all-MiniLM-L6-v2 via transformers.js: free, runs locally, 384 dimensions. */
export const HS_EMBEDDING_DIMENSIONS = 384

/**
 * Harmonized System subheadings with indicative GCC duty.
 * Duty rates are illustrative for a portfolio demo, not customs advice.
 */
export const hsCodes = pgTable(
  'hs_codes',
  {
    code: text().primaryKey(), // 6-digit HS subheading
    description: text().notNull(),
    chapter: integer().notNull(),
    dutyRateBp: integer().notNull(), // basis points: 500 = 5%
    restricted: boolean().default(false).notNull(),
    embedding: vector({ dimensions: HS_EMBEDDING_DIMENSIONS }),
  },
  (t) => [
    check('hs_codes_format', sql`${t.code} ~ '^[0-9]{6}$'`),
    check('hs_codes_duty_range', sql`${t.dutyRateBp} between 0 and 50000`),
    index('hs_codes_embedding_hnsw').using('hnsw', t.embedding.op('vector_cosine_ops')),
    pgPolicy('hs_codes_select', { for: 'select', to: authenticatedRole, using: ANY_ROLE }),
  ],
).enableRLS()

export const classificationDecision = pgEnum('classification_decision', ['APPROVED', 'OVERRIDDEN'])

/** Audit trail of every broker decision on an AI-suggested HS code. Append-only. */
export const classificationDecisions = pgTable(
  'classification_decisions',
  {
    id: uuid().defaultRandom().primaryKey(),
    lineItemId: uuid()
      .notNull()
      .references(() => lineItems.id, { onDelete: 'cascade' }),
    suggestedCode: text(),
    chosenCode: text()
      .notNull()
      .references(() => hsCodes.code),
    confidence: numeric({ precision: 5, scale: 4 }), // 0..1 cosine similarity
    decision: classificationDecision().notNull(),
    note: text(),
    decidedBy: uuid().references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    check('classification_confidence_range', sql`${t.confidence} is null or ${t.confidence} between 0 and 1`),
    index('classification_line_item_idx').on(t.lineItemId),
    pgPolicy('classification_select', { for: 'select', to: authenticatedRole, using: ANY_ROLE }),
    pgPolicy('classification_insert', { for: 'insert', to: authenticatedRole, withCheck: roleIn('broker') }),
  ],
).enableRLS()
