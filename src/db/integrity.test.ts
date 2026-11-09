import { beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from '../../test/pglite'

let t: TestDb

beforeAll(async () => {
  t = await createTestDb()
  await t.pg.exec(`
    INSERT INTO accounts (code, name, type) VALUES
      ('1000', 'Cash', 'ASSET'), ('2100', 'Escrow Holding', 'LIABILITY'), ('4000', 'Freight Revenue', 'REVENUE');
  `)
}, 60_000)

/** Post entries as one DB transaction; returns the transaction id. */
async function post(key: string, entries: Array<[account: string, dir: 'DEBIT' | 'CREDIT', aed: string]>) {
  await t.pg.exec('BEGIN')
  try {
    const tx = await t.pg.query<{ id: string }>(
      `INSERT INTO ledger_transactions (description, idempotency_key) VALUES ('test', $1) RETURNING id`,
      [key],
    )
    const id = tx.rows[0]!.id
    for (const [account, dir, aed] of entries)
      await t.pg.query(
        `INSERT INTO ledger_entries (transaction_id, account_code, direction, amount, currency, fx_rate_to_aed, amount_aed)
         VALUES ($1, $2, $3, $4, 'AED', 1, $4)`,
        [id, account, dir, aed],
      )
    await t.pg.exec('COMMIT')
    return id
  } catch (e) {
    await t.pg.exec('ROLLBACK')
    throw e
  }
}

describe('migrations', () => {
  it('apply cleanly on Postgres with pgvector', async () => {
    const r = await t.pg.query<{ extname: string }>(`SELECT extname FROM pg_extension WHERE extname = 'vector'`)
    expect(r.rows).toHaveLength(1)
  })

  it('enable RLS on every public table', async () => {
    const r = await t.pg.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity`,
    )
    expect(r.rows.map((x) => x.tablename)).toEqual([])
  })
})

describe('profile trigger', () => {
  it('takes the role from app_metadata and defaults unknown roles to coordinator', async () => {
    const fin = await t.createUser('fin@x.test', 'finance')
    const weird = await t.createUser('weird@x.test', 'admin')
    const r = await t.pg.query<{ id: string; role: string }>(`SELECT id, role FROM profiles WHERE id IN ($1, $2)`, [fin, weird])
    const byId = Object.fromEntries(r.rows.map((x) => [x.id, x.role]))
    expect(byId[fin]).toBe('finance')
    expect(byId[weird]).toBe('coordinator')
  })
})

describe('ledger guards', () => {
  it('accepts a balanced transaction', async () => {
    await expect(post('ok-1', [['1000', 'DEBIT', '100.00'], ['2100', 'CREDIT', '100.00']])).resolves.toBeTruthy()
  })

  it('rejects an unbalanced transaction at commit', async () => {
    await expect(post('bad-1', [['1000', 'DEBIT', '100.00'], ['2100', 'CREDIT', '99.99']])).rejects.toThrow(/unbalanced/)
  })

  it('rejects a single-sided transaction', async () => {
    await expect(post('bad-2', [['1000', 'DEBIT', '50.00']])).rejects.toThrow(/at least two entries/)
  })

  it('accepts split entries that balance in total', async () => {
    await expect(
      post('ok-2', [['1000', 'DEBIT', '100.00'], ['2100', 'CREDIT', '60.00'], ['4000', 'CREDIT', '40.00']]),
    ).resolves.toBeTruthy()
  })

  it('makes entries append-only (no UPDATE, DELETE or TRUNCATE)', async () => {
    await expect(t.pg.exec(`UPDATE ledger_entries SET amount = 1`)).rejects.toThrow(/append-only/)
    await expect(t.pg.exec(`DELETE FROM ledger_entries`)).rejects.toThrow(/append-only/)
    await expect(t.pg.exec(`TRUNCATE ledger_entries CASCADE`)).rejects.toThrow(/append-only/)
    await expect(t.pg.exec(`DELETE FROM ledger_transactions`)).rejects.toThrow(/append-only/)
  })

  it('rejects duplicate idempotency keys', async () => {
    await expect(post('ok-1', [['1000', 'DEBIT', '1.00'], ['2100', 'CREDIT', '1.00']])).rejects.toThrow(/unique|duplicate/i)
  })

  it('derives balances from entries', async () => {
    const r = await t.pg.query<{ code: string; balance_aed: string }>(
      `SELECT code, balance_aed FROM account_balances ORDER BY code`,
    )
    expect(r.rows).toEqual([
      { code: '1000', balance_aed: '200.00' },
      { code: '2100', balance_aed: '160.00' },
      { code: '4000', balance_aed: '40.00' },
    ])
  })
})

describe('row-level security', () => {
  let coordinator: string
  let finance: string

  beforeAll(async () => {
    coordinator = await t.createUser('coord@x.test', 'coordinator')
    finance = await t.createUser('finance2@x.test', 'finance')
  })

  it('users see only their own profile and cannot change their role', async () => {
    await t.asUser(coordinator, async (db) => {
      const r = await db.query<{ role: string }>(`SELECT role FROM profiles`)
      expect(r.rows).toEqual([{ role: 'coordinator' }])
      const upd = await db.query(`UPDATE profiles SET role = 'finance'`)
      expect(upd.affectedRows).toBe(0)
    })
  })

  it('only finance can read the ledger', async () => {
    const seen = async (user: string) =>
      t.asUser(user, async (db) => (await db.query(`SELECT 1 FROM ledger_entries`)).rows.length)
    expect(await seen(coordinator)).toBe(0)
    expect(await seen(finance)).toBeGreaterThan(0)
  })

  it('nobody can write money rows through the API, not even finance', async () => {
    await t.asUser(finance, async (db) => {
      await expect(
        db.query(`INSERT INTO ledger_transactions (description, idempotency_key) VALUES ('x', 'api-1')`),
      ).rejects.toThrow(/row-level security/)
    })
  })

  it('signed-out (anon) users see nothing', async () => {
    await t.pg.exec('BEGIN; SET LOCAL ROLE anon')
    try {
      expect((await t.pg.query(`SELECT 1 FROM accounts`)).rows).toHaveLength(0)
      expect((await t.pg.query(`SELECT 1 FROM profiles`)).rows).toHaveLength(0)
    } finally {
      await t.pg.exec('ROLLBACK')
    }
  })
})
