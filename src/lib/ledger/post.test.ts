import { beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from '../../../test/pglite'
import { ACCOUNTS } from '../../db/data/demo'
import * as schema from '../../db/schema'
import { toMinor } from '../money'
import { IdempotencyError } from '../idempotency'
import { ACCOUNT, escrowFunded, invoiceIssued } from './entries'
import { accountBalances, normaliseRate, postTransaction, reverseTransaction } from './post'

let t: TestDb
const usd = (amount: string) => ({ amount: toMinor(amount), currency: 'USD' as const, fxRateToAed: '3.6725' })
const balanceOf = async (code: string) => (await accountBalances(t.db)).find((a) => a.code === code)!.balanceAed

beforeAll(async () => {
  t = await createTestDb()
  await t.db.insert(schema.accounts).values([...ACCOUNTS])
}, 60_000)

describe('postTransaction', () => {
  it('posts a balanced transaction and updates derived balances', async () => {
    const r = await postTransaction(t.db, { idempotencyKey: 'test:fund:1', description: 'Escrow funded', entries: escrowFunded(usd('1000.00')) })
    expect(r.replayed).toBe(false)
    expect(await balanceOf(ACCOUNT.CASH)).toBe(toMinor('3672.50'))
    expect(await balanceOf(ACCOUNT.ESCROW)).toBe(toMinor('3672.50'))
  })

  it('replays a retried request instead of double-posting', async () => {
    const first = await postTransaction(t.db, { idempotencyKey: 'test:fund:2', description: 'Escrow funded', entries: escrowFunded(usd('10.00')) })
    const retry = await postTransaction(t.db, { idempotencyKey: 'test:fund:2', description: 'Escrow funded', entries: escrowFunded(usd('10.00')) })
    expect(retry).toEqual({ transactionId: first.transactionId, replayed: true })
    expect(await t.db.$count(schema.ledgerTransactions)).toBe(2)
  })

  it('rejects reuse of a key for a different request', async () => {
    await expect(
      postTransaction(t.db, { idempotencyKey: 'test:fund:2', description: 'Escrow funded', entries: escrowFunded(usd('99.00')) }),
    ).rejects.toBeInstanceOf(IdempotencyError)
  })

  it('rejects malformed keys and empty descriptions', async () => {
    await expect(postTransaction(t.db, { idempotencyKey: 'x', description: 'd', entries: escrowFunded(usd('1.00')) })).rejects.toThrow(/Idempotency-Key/)
    await expect(postTransaction(t.db, { idempotencyKey: 'test:empty:1', description: ' ', entries: escrowFunded(usd('1.00')) })).rejects.toThrow(/description/)
  })

  it('leaves nothing behind when a posting fails', async () => {
    const before = await t.db.$count(schema.ledgerEntries)
    await expect(
      postTransaction(t.db, {
        idempotencyKey: 'test:bad-account:1',
        description: 'Unknown account',
        entries: [
          { account: '9999' as never, direction: 'DEBIT', amount: 100n, currency: 'AED', fxRateToAed: '1' },
          { account: ACCOUNT.CASH, direction: 'CREDIT', amount: 100n, currency: 'AED', fxRateToAed: '1' },
        ],
      }),
    ).rejects.toThrow()
    expect(await t.db.$count(schema.ledgerEntries)).toBe(before)
    expect(await t.db.$count(schema.idempotencyKeys)).toBe(2)
  })

  it('posts multi-line invoices with VAT and duty', async () => {
    await postTransaction(t.db, {
      idempotencyKey: 'test:invoice:1',
      description: 'Invoice issued',
      entries: invoiceIssued({ subtotal: toMinor('1100.00'), duty: toMinor('50.00'), vat: toMinor('57.50'), total: toMinor('1207.50') }, 'AED', '1'),
    })
    expect(await balanceOf(ACCOUNT.VAT_PAYABLE)).toBe(toMinor('57.50'))
    expect(await balanceOf(ACCOUNT.DUTY_PAYABLE)).toBe(toMinor('50.00'))
  })
})

describe('reverseTransaction', () => {
  it('posts the exact opposite and restores balances', async () => {
    const cashBefore = await balanceOf(ACCOUNT.CASH)
    const { transactionId } = await postTransaction(t.db, { idempotencyKey: 'test:mistake:1', description: 'Wrong amount', entries: escrowFunded(usd('500.00')) })
    const rev = await reverseTransaction(t.db, { transactionId, idempotencyKey: 'test:reverse:1', reason: 'entered twice' })
    expect(rev.replayed).toBe(false)
    expect(await balanceOf(ACCOUNT.CASH)).toBe(cashBefore)
  })

  it('is idempotent with the same key, and refuses a second reversal with a new key', async () => {
    const { transactionId } = await postTransaction(t.db, { idempotencyKey: 'test:mistake:2', description: 'Oops', entries: escrowFunded(usd('5.00')) })
    const a = await reverseTransaction(t.db, { transactionId, idempotencyKey: 'test:reverse:2', reason: 'x' })
    const b = await reverseTransaction(t.db, { transactionId, idempotencyKey: 'test:reverse:2', reason: 'x' })
    expect(b).toEqual({ ...a, replayed: true })
    await expect(reverseTransaction(t.db, { transactionId, idempotencyKey: 'test:reverse:3', reason: 'x' })).rejects.toThrow(/already been reversed/)
  })

  it('cannot reverse a reversal', async () => {
    const { transactionId } = await postTransaction(t.db, { idempotencyKey: 'test:mistake:3', description: 'Oops', entries: escrowFunded(usd('5.00')) })
    const rev = await reverseTransaction(t.db, { transactionId, idempotencyKey: 'test:reverse:4', reason: 'x' })
    await expect(reverseTransaction(t.db, { transactionId: rev.transactionId, idempotencyKey: 'test:reverse:5', reason: 'x' })).rejects.toThrow(/cannot itself be reversed/)
  })
})

describe('trial balance', () => {
  it('total debit-normal balances equal total credit-normal balances', async () => {
    const all = await accountBalances(t.db)
    const side = (types: string[]) => all.filter((a) => types.includes(a.type)).reduce((s, a) => s + a.balanceAed, 0n)
    expect(side(['ASSET', 'EXPENSE'])).toBe(side(['LIABILITY', 'EQUITY', 'REVENUE']))
  })
})

describe('normaliseRate', () => {
  it('trims numeric padding', () => {
    expect(normaliseRate('3.67250000')).toBe('3.6725')
    expect(normaliseRate('1.00000000')).toBe('1')
    expect(normaliseRate('4')).toBe('4')
  })
})
