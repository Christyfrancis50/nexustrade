import { describe, expect, it } from 'vitest'
import { toMinor } from '../money'
import { ACCOUNT, carrierPaid, escrowFunded, invoiceIssued, milestoneReleased, reversalOf, withAed, type DraftEntry } from './entries'

const aed = (amount: string) => ({ amount: toMinor(amount), currency: 'AED' as const, fxRateToAed: '1' })
const usd = (amount: string) => ({ amount: toMinor(amount), currency: 'USD' as const, fxRateToAed: '3.6725' })
const totals = (e: ReturnType<typeof withAed>) => ({
  debit: e.filter((x) => x.direction === 'DEBIT').reduce((s, x) => s + x.amountAed, 0n),
  credit: e.filter((x) => x.direction === 'CREDIT').reduce((s, x) => s + x.amountAed, 0n),
})

describe('posting rules', () => {
  it('escrow funding, release and payout move money cash → escrow → carrier payable → cash', () => {
    const steps = [escrowFunded(aed('1000.00')), milestoneReleased(aed('400.00')), carrierPaid(aed('400.00'))]
    const net = new Map<string, bigint>()
    for (const step of steps)
      for (const e of withAed(step)) net.set(e.account, (net.get(e.account) ?? 0n) + (e.direction === 'DEBIT' ? e.amountAed : -e.amountAed))
    expect(net.get(ACCOUNT.CASH)).toBe(toMinor('600.00')) // 1000 in, 400 out
    expect(net.get(ACCOUNT.ESCROW)).toBe(-toMinor('600.00')) // still holding 600 (credit balance)
    expect(net.get(ACCOUNT.CARRIER_PAYABLE)).toBe(0n) // owed and paid
  })

  it('invoices split the receivable into revenue, duty and VAT', () => {
    const e = withAed(invoiceIssued({ subtotal: 110000n, duty: 5000n, vat: 5750n, total: 120750n }, 'AED', '1'))
    expect(e.map((x) => [x.account, x.direction, x.amount])).toEqual([
      [ACCOUNT.RECEIVABLE, 'DEBIT', 120750n],
      [ACCOUNT.GOODS_REVENUE, 'CREDIT', 110000n],
      [ACCOUNT.DUTY_PAYABLE, 'CREDIT', 5000n],
      [ACCOUNT.VAT_PAYABLE, 'CREDIT', 5750n],
    ])
  })

  it('omits zero duty and VAT lines (exempt supplies)', () => {
    const e = invoiceIssued({ subtotal: 100n, duty: 0n, vat: 0n, total: 100n }, 'AED', '1')
    expect(e).toHaveLength(2)
  })

  it('refuses invoice parts that do not add up', () => {
    expect(() => invoiceIssued({ subtotal: 100n, duty: 0n, vat: 5n, total: 104n }, 'AED', '1')).toThrow(/add up/)
  })

  it('reversal flips every line and nets to zero', () => {
    const original = escrowFunded(usd('250.00'))
    const both = [...withAed(original), ...withAed(reversalOf(original))]
    const net = both.reduce((s, x) => s + (x.direction === 'DEBIT' ? x.amountAed : -x.amountAed), 0n)
    expect(net).toBe(0n)
  })
})

describe('withAed', () => {
  it('converts foreign amounts at the line rate', () => {
    const [cash] = withAed(escrowFunded(usd('100.00')))
    expect(cash!.amountAed).toBe(toMinor('367.25'))
  })

  it('absorbs per-line rounding so AED totals balance exactly', () => {
    // 0.02 USD → 0.07345 → 0.07 AED, but 0.01 + 0.01 → 0.04 + 0.04 = 0.08 AED
    const draft: DraftEntry[] = [
      { account: ACCOUNT.RECEIVABLE, direction: 'DEBIT', amount: 2n, currency: 'USD', fxRateToAed: '3.6725' },
      { account: ACCOUNT.GOODS_REVENUE, direction: 'CREDIT', amount: 1n, currency: 'USD', fxRateToAed: '3.6725' },
      { account: ACCOUNT.VAT_PAYABLE, direction: 'CREDIT', amount: 1n, currency: 'USD', fxRateToAed: '3.6725' },
    ]
    const t = totals(withAed(draft))
    expect(t.debit).toBe(t.credit)
    expect(t.debit).toBe(8n)
  })

  it('rejects unbalanced, one-sided, zero and mis-rated entries', () => {
    const d = (direction: 'DEBIT' | 'CREDIT', amount: bigint, extra: Partial<DraftEntry> = {}): DraftEntry => ({
      account: ACCOUNT.CASH,
      direction,
      amount,
      currency: 'AED',
      fxRateToAed: '1',
      ...extra,
    })
    expect(() => withAed([d('DEBIT', 100n), d('CREDIT', 99n)])).toThrow(/Unbalanced in AED/)
    expect(() => withAed([d('DEBIT', 100n)])).toThrow(/one debit and one credit/)
    expect(() => withAed([d('DEBIT', 0n), d('CREDIT', 0n)])).toThrow(/positive/)
    expect(() => withAed([d('DEBIT', 1n, { fxRateToAed: '3.6725' }), d('CREDIT', 1n)])).toThrow(/rate of 1/)
  })

  it('requires balance in each currency, not just in AED', () => {
    // 100 USD (367.25 AED) against 367.25 AED balances in AED but is a hidden FX trade.
    expect(() =>
      withAed([
        { account: ACCOUNT.CASH, direction: 'DEBIT', amount: 10000n, currency: 'USD', fxRateToAed: '3.6725' },
        { account: ACCOUNT.ESCROW, direction: 'CREDIT', amount: 36725n, currency: 'AED', fxRateToAed: '1' },
      ]),
    ).toThrow(/Unbalanced in USD/)
  })
})
