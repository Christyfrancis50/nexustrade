import type { Metadata } from 'next'
import { Suspense } from 'react'
import { db } from '@/db'
import { requireRole } from '@/lib/auth/session'
import { formatMoney, toMinor } from '@/lib/money'
import { monthlySpend, vatSummary } from '@/features/reports/build'
import { fundedFreight, invoiceRows, shipmentStatusCounts } from '@/features/reports/data'
import { parsePeriod } from '@/features/reports/period'
import { FinanceTabs } from '@/features/reports/components/finance-tabs'
import { CarrierChart, SpendChart, StatusChart } from '@/features/reports/components/lazy-charts'

export const metadata: Metadata = { title: 'Reports · NexusTrade' }

type SP = Promise<Record<string, string | string[] | undefined>>
const aed = (minor: bigint) => formatMoney(minor, 'AED')
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : null)

async function Reports({ searchParams }: { searchParams: SP }) {
  await requireRole('finance')
  const sp = await searchParams
  let period
  let periodError: string | null = null
  try {
    period = parsePeriod({ from: one(sp.from), to: one(sp.to) })
  } catch (e) {
    periodError = e instanceof Error ? e.message : 'Invalid period'
    period = parsePeriod({})
  }

  const conn = db()
  const [funded, invoices, statuses] = await Promise.all([
    // Charts cover ~13 months back from the end of the selected period.
    fundedFreight(conn, new Date(period.toExclusive.getTime() - 400 * 86_400_000)),
    invoiceRows(conn, period.from, period.toExclusive),
    shipmentStatusCounts(conn),
  ])
  const spend = monthlySpend(funded, 6, new Date(period.toExclusive.getTime() - 1))
  const byCarrier = [...funded.reduce((m, r) => m.set(r.carrier, (m.get(r.carrier) ?? 0n) + toMinor(r.amountAed)), new Map<string, bigint>())]
    .map(([carrier, minor]) => ({ carrier, aed: Number(minor) / 100 }))
    .sort((a, b) => b.aed - a.aed)
  const ORDER = ['DRAFT', 'IN_TRANSIT', 'CUSTOMS_HOLD', 'CLEARED', 'DELIVERED']
  const statusData = ORDER.map((status) => ({ status, count: statuses.find((s) => s.status === status)?.count ?? 0 }))
  const vat = vatSummary(invoices, period.from, period.toExclusive)
  const qs = `from=${period.label.from}&to=${period.label.to}`

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-foreground/10 p-4">
          <h2 className="mb-2 font-medium">Freight funded per month (AED)</h2>
          <SpendChart data={spend} />
        </section>
        <section className="rounded-xl border border-foreground/10 p-4">
          <h2 className="mb-2 font-medium">Freight by carrier (AED)</h2>
          {byCarrier.length ? <CarrierChart data={byCarrier} /> : <p className="text-sm text-foreground/60">No funded shipments yet.</p>}
        </section>
        <section className="rounded-xl border border-foreground/10 p-4 lg:col-span-2">
          <h2 className="mb-2 font-medium">Shipments by status</h2>
          <StatusChart data={statusData} />
        </section>
      </div>

      <section aria-labelledby="vat" className="flex flex-col gap-4 rounded-xl border border-foreground/10 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="vat" className="text-lg font-medium">VAT audit</h2>
            <p className="text-sm text-foreground/60">
              {vat.period.from} to {period.label.to} · {invoices.length} invoice{invoices.length === 1 ? '' : 's'}
            </p>
          </div>
          <form className="flex flex-wrap items-end gap-2 text-sm">
            <label className="flex flex-col gap-1">
              From
              <input type="date" name="from" defaultValue={period.label.from} className="rounded-md border border-foreground/15 bg-transparent px-2 py-1" />
            </label>
            <label className="flex flex-col gap-1">
              To
              <input type="date" name="to" defaultValue={period.label.to} className="rounded-md border border-foreground/15 bg-transparent px-2 py-1" />
            </label>
            <button className="rounded-md border border-foreground/15 px-3 py-1.5 hover:bg-foreground/5">Apply</button>
          </form>
        </div>
        {periodError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{periodError}. Showing the last 12 months.</p>}

        <dl className="grid gap-3 sm:grid-cols-4">
          {[
            ['Standard-rated supplies', aed(vat.standardRated.taxableAed), `${vat.standardRated.count} invoices`],
            ['Output VAT (5%)', aed(vat.standardRated.vatAed), 'Payable to the FTA'],
            ['Zero-rated supplies', aed(vat.zeroRated.valueAed), `${vat.zeroRated.count} invoices`],
            ['Exempt supplies', aed(vat.exempt.valueAed), `${vat.exempt.count} invoices`],
          ].map(([label, value, hint]) => (
            <div key={label} className="rounded-lg bg-foreground/[0.03] p-3">
              <dt className="text-xs uppercase tracking-wider text-foreground/50">{label}</dt>
              <dd className="mt-1 font-semibold tabular-nums">{value}</dd>
              <dd className="text-xs text-foreground/50">{hint}</dd>
            </div>
          ))}
        </dl>

        {vat.issues.length > 0 ? (
          <div className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
            <p className="font-medium">{vat.issues.length} item{vat.issues.length > 1 ? 's' : ''} to review</p>
            <ul className="mt-1 list-disc pl-5">{vat.issues.map((i) => <li key={i}>{i}</li>)}</ul>
          </div>
        ) : (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">All invoices in this period pass the VAT checks.</p>
        )}

        <div className="flex flex-wrap gap-2 border-t border-foreground/10 pt-4">
          <a href={`/api/exports/vat?${qs}`} className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background">VAT register (CSV)</a>
          <a href={`/api/exports/journal?${qs}`} className="rounded-md border border-foreground/15 px-3 py-1.5 text-sm hover:bg-foreground/5">Journal for Zoho Books (CSV)</a>
          <a href={`/api/exports/xero?${qs}`} className="rounded-md border border-foreground/15 px-3 py-1.5 text-sm hover:bg-foreground/5">Xero manual journal (CSV)</a>
        </div>
        <p className="text-xs text-foreground/50">
          Exports are in AED, one balanced journal per ledger transaction. Zoho Books maps columns on import. For Xero, compare the
          headers with the template on your import screen and map receivable, payable and bank accounts to clearing accounts, because
          Xero doesn&apos;t allow those in manual journals. Duty figures are indicative.
        </p>
      </section>
    </div>
  )
}

export default function ReportsPage(props: { searchParams: SP }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-foreground/60">Finance Controller</p>
          <h1 className="text-3xl font-semibold tracking-tight">Reports &amp; exports</h1>
        </div>
        <FinanceTabs active="reports" />
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-foreground/5" />}>
        <Reports searchParams={props.searchParams} />
      </Suspense>
    </div>
  )
}
