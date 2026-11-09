import { and, asc, eq, isNotNull } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '../../db/schema'
import { fromMinor, toMinor, type Currency } from '../money'
import { assertIdempotencyKey, IdempotencyError, requestHash } from '../idempotency'
import { LedgerError, reversalOf, withAed, type AccountCode, type DraftEntry } from './entries'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export type PostInput = {
  idempotencyKey: string
  description: string
  entries: DraftEntry[]
  shipmentId?: string | null
  invoiceId?: string | null
  postedBy?: string | null
}

export type PostResult = { transactionId: string; replayed: boolean }

const SCOPE = 'ledger.post'

/**
 * Post a balanced transaction exactly once.
 *
 * - Same key + same request → returns the original transaction (`replayed: true`).
 *   Network retries can never double-post.
 * - Same key + different request → IdempotencyError (likely a client bug).
 * - Concurrent duplicates: the loser hits a unique-key violation and rolls back;
 *   retrying it then replays the winner's result.
 *
 * The database independently rejects unbalanced or mutated ledger rows.
 */
export async function postTransaction(db: Db, input: PostInput & { reversesId?: string | null }): Promise<PostResult> {
  assertIdempotencyKey(input.idempotencyKey)
  if (!input.description.trim()) throw new LedgerError('A transaction needs a description')
  const posted = withAed(input.entries)
  const hash = requestHash(SCOPE, {
    description: input.description,
    entries: input.entries,
    shipmentId: input.shipmentId ?? null,
    invoiceId: input.invoiceId ?? null,
    reversesId: input.reversesId ?? null,
  })

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.idempotencyKeys)
      .where(eq(schema.idempotencyKeys.key, input.idempotencyKey))
    if (existing) {
      if (existing.scope !== SCOPE || existing.requestHash !== hash)
        throw new IdempotencyError(`Idempotency-Key "${input.idempotencyKey}" was already used for a different request`)
      return { transactionId: (existing.response as { transactionId: string }).transactionId, replayed: true }
    }

    const [header] = await tx
      .insert(schema.ledgerTransactions)
      .values({
        description: input.description,
        shipmentId: input.shipmentId ?? null,
        invoiceId: input.invoiceId ?? null,
        reversesId: input.reversesId ?? null,
        idempotencyKey: input.idempotencyKey,
        postedBy: input.postedBy ?? null,
      })
      .returning({ id: schema.ledgerTransactions.id })
    const transactionId = header!.id

    await tx.insert(schema.ledgerEntries).values(
      posted.map((e) => ({
        transactionId,
        accountCode: e.account,
        direction: e.direction,
        amount: fromMinor(e.amount),
        currency: e.currency,
        fxRateToAed: e.fxRateToAed,
        amountAed: fromMinor(e.amountAed),
      })),
    )

    await tx.insert(schema.idempotencyKeys).values({
      key: input.idempotencyKey,
      scope: SCOPE,
      requestHash: hash,
      response: { transactionId },
    })

    return { transactionId, replayed: false }
  })
}

/**
 * Correct a posted transaction by posting its exact opposite. The original is
 * never edited. A transaction can be reversed once (unique index), and
 * reversals themselves cannot be reversed: post a fresh transaction instead.
 */
export async function reverseTransaction(
  db: Db,
  input: { transactionId: string; idempotencyKey: string; reason: string; postedBy?: string | null },
): Promise<PostResult> {
  const [original] = await db
    .select()
    .from(schema.ledgerTransactions)
    .where(eq(schema.ledgerTransactions.id, input.transactionId))
  if (!original) throw new LedgerError('Transaction not found')
  if (original.reversesId) throw new LedgerError('A reversal cannot itself be reversed; post a new transaction instead')

  const [already] = await db
    .select({ id: schema.ledgerTransactions.id, key: schema.ledgerTransactions.idempotencyKey })
    .from(schema.ledgerTransactions)
    .where(and(eq(schema.ledgerTransactions.reversesId, original.id), isNotNull(schema.ledgerTransactions.reversesId)))
  if (already && already.key !== input.idempotencyKey) throw new LedgerError('This transaction has already been reversed')

  const lines = await db
    .select()
    .from(schema.ledgerEntries)
    .where(eq(schema.ledgerEntries.transactionId, original.id))
    .orderBy(asc(schema.ledgerEntries.createdAt))

  const entries = reversalOf(
    lines.map((l) => ({
      account: l.accountCode as AccountCode,
      direction: l.direction,
      amount: toMinor(l.amount),
      currency: l.currency as Currency,
      fxRateToAed: normaliseRate(l.fxRateToAed),
    })),
  )

  return postTransaction(db, {
    idempotencyKey: input.idempotencyKey,
    description: `Reversal: ${original.description} (${input.reason})`,
    entries,
    shipmentId: original.shipmentId,
    invoiceId: original.invoiceId,
    reversesId: original.id,
    postedBy: input.postedBy ?? null,
  })
}

/** numeric(18,8) comes back as "3.67250000"; trim to the canonical form used when posting. */
export function normaliseRate(rate: string): string {
  return rate.includes('.') ? rate.replace(/0+$/, '').replace(/\.$/, '') : rate
}

/** Balance of every account in AED, derived from entries (never stored). */
export async function accountBalances(db: Db) {
  const rows = await db.select().from(schema.accounts).orderBy(asc(schema.accounts.code))
  const entries = await db
    .select({ account: schema.ledgerEntries.accountCode, direction: schema.ledgerEntries.direction, amountAed: schema.ledgerEntries.amountAed })
    .from(schema.ledgerEntries)
  const debitNormal = new Set(rows.filter((r) => r.type === 'ASSET' || r.type === 'EXPENSE').map((r) => r.code))
  const balance = new Map<string, bigint>()
  for (const e of entries) {
    const sign = (e.direction === 'DEBIT') === debitNormal.has(e.account) ? 1n : -1n
    balance.set(e.account, (balance.get(e.account) ?? 0n) + sign * toMinor(e.amountAed))
  }
  return rows.map((r) => ({ ...r, balanceAed: balance.get(r.code) ?? 0n }))
}
