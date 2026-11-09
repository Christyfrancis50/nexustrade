import type { Metadata } from 'next'
import { Suspense } from 'react'
import { env } from '@/env'
import { requireRole } from '@/lib/auth/session'
import { formatMoney, toMinor, type Currency } from '@/lib/money'
import { financeEscrowView } from '@/features/escrow/queries'
import { MILESTONE_LABEL } from '@/features/escrow/rules'
import { FundButtons, ReleaseButton } from '@/features/escrow/components/escrow-buttons'
import { ShipmentStatus } from '@/features/shipments/components/badges'
import { FinanceTabs } from '@/features/reports/components/finance-tabs'

export const metadata: Metadata = { title: 'Finance · NexusTrade' }

const aed = (minor: bigint) => formatMoney(minor, 'AED')
const MILESTONE_TONE: Record<string, string> = {
  PENDING: 'text-foreground/50',
  LOCKED: 'text-sky-700 dark:text-sky-300',
  RELEASED: 'text-emerald-700 dark:text-emerald-300',
}

async function Banner({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const paid = typeof sp.paid === 'string' ? sp.paid : null
  const cancelled = typeof sp.cancelled === 'string' ? sp.cancelled : null
  if (paid)
    return (
      <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
        Stripe test payment for {paid} completed. Escrow is funded as soon as Stripe&apos;s webhook arrives (refresh in a moment).
      </p>
    )
  if (cancelled)
    return <p role="status" className="rounded-lg bg-foreground/5 px-3 py-2 text-sm">Checkout for {cancelled} was cancelled. Nothing was charged.</p>
  return null
}

async function Escrow() {
  const user = await requireRole('finance')
  const { totals, shipments } = await financeEscrowView()
  const stripeEnabled = Boolean(env.STRIPE_SECRET_KEY)

  const stats = [
    { label: 'Held in escrow', value: aed(totals.escrowHeld), hint: 'Funded, not yet released' },
    { label: 'VAT payable', value: aed(totals.vatPayable), hint: 'Owed to the FTA' },
    { label: 'Duty payable', value: aed(totals.dutyPayable), hint: 'Owed to customs' },
    { label: 'Owed to carriers', value: aed(totals.carrierPayable), hint: 'Released, not yet paid' },
  ]

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-foreground/60">Finance Controller</p>
            <h1 className="text-3xl font-semibold tracking-tight">Escrow &amp; payouts</h1>
          </div>
          <FinanceTabs active="escrow" />
        </div>
        <p className="max-w-2xl text-foreground/70">
          Welcome, {user.fullName ?? user.email}. Importers fund the full freight at booking; you release it to carriers at each
          milestone. {stripeEnabled ? 'Payments use Stripe test mode.' : 'Stripe keys are not set, so payments are simulated.'}
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-foreground/10 p-4">
            <dt className="text-xs uppercase tracking-wider text-foreground/50">{s.label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{s.value}</dd>
            <dd className="text-xs text-foreground/50">{s.hint}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="escrow" className="flex flex-col gap-3">
        <h2 id="escrow" className="font-medium">Shipments</h2>
        <ul className="flex flex-col gap-3">
          {shipments.map((s) => (
            <li key={s.id} className="flex flex-col gap-3 rounded-xl border border-foreground/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono font-semibold">{s.trackingNumber}</span>
                  <ShipmentStatus status={s.status} />
                  <span className="text-sm tabular-nums text-foreground/60">
                    {formatMoney(toMinor(s.freight), s.currency as Currency)} · {s.carrierName}
                  </span>
                </div>
                {s.canFund && <FundButtons shipmentId={s.id} stripeEnabled={stripeEnabled} />}
                {!s.canFund && !s.funded && <span className="text-xs text-foreground/50">Not funded</span>}
              </div>
              {s.milestones.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-3">
                  {s.milestones.map((m) => (
                    <div key={m.id} className="flex items-start justify-between gap-2 rounded-lg bg-foreground/[0.03] p-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{MILESTONE_LABEL[m.kind]}</span>
                        <span className="text-sm tabular-nums">{formatMoney(toMinor(m.amount), m.currency as Currency)}</span>
                        <span className={`text-xs ${MILESTONE_TONE[m.status]}`}>{m.status.toLowerCase()}</span>
                      </div>
                      {m.status !== 'RELEASED' && s.funded && <ReleaseButton milestoneId={m.id} blocker={m.blocker} />}
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default function FinancePage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={null}>
        <Banner searchParams={props.searchParams} />
      </Suspense>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-foreground/5" />}>
        <Escrow />
      </Suspense>
    </div>
  )
}
