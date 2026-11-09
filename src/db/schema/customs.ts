import { sql, type SQL } from 'drizzle-orm'
import { boolean, check, customType, index, integer, numeric, pgEnum, pgPolicy, pgTable, text, uuid, vector } from 'drizzle-orm/pg-core'

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' })
import { authenticatedRole } from 'drizzle-orm/supabase'
import { ANY_ROLE, createdAt, roleIn } from './_shared'
import { lineItems } from './shipments'
import { profiles } from './profiles'

/** Embedding size: gemini-embedding-001 truncated to 384 dims (free tier). */
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
    heading: text().default('').notNull(), // parent 4-digit heading text, for context
    section: text().default('').notNull(), // HS section (I–XXI)
    chapter: integer().notNull(),
    dutyRateBp: integer().notNull(), // basis points: 500 = 5%
    restricted: boolean().default(false).notNull(),
    embedding: vector({ dimensions: HS_EMBEDDING_DIMENSIONS }),
    // Full-text search fallback when no embedding model is configured.
    search: tsvector().generatedAlwaysAs(
      (): SQL => sql`setweight(to_tsvector('english', ${hsCodes.description}), 'A') || setweight(to_tsvector('english', ${hsCodes.heading}), 'B')`,
    ),
  },
  (t) => [
    check('hs_codes_format', sql`${t.code} ~ '^[0-9]{6}$'`),
    index('hs_codes_search_gin').using('gin', t.search),
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
