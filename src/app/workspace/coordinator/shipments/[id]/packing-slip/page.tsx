import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { z } from 'zod'
import { requireRole } from '@/lib/auth/session'
import { getShipment } from '@/features/shipments/queries'
import { PrintButton } from '@/features/reports/components/print-button'

export const metadata: Metadata = { title: 'Packing slip · NexusTrade' }

const num = (v: string | null) => (v === null ? 0 : Number(v))

async function Slip({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('coordinator')
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const data = await getShipment(id)
  if (!data) notFound()
  const { shipment: s, lineItems } = data
  const weight = lineItems.reduce((t, l) => t + num(l.weightKg), 0)
  const volume = lineItems.reduce((t, l) => t + num(l.volumeCbm), 0)

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 bg-background text-foreground print:max-w-none">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/workspace/coordinator/shipments/${s.id}`} className="text-sm text-foreground/60 hover:text-foreground">
          ← Back to shipment
        </Link>
        <PrintButton />
      </div>

      <header className="flex items-start justify-between border-b border-foreground/20 pb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-foreground/60">NexusTrade</p>
          <h1 className="text-2xl font-semibold">Packing slip</h1>
        </div>
        <div className="text-right text-sm">
          <p className="font-mono text-lg font-semibold">{s.trackingNumber}</p>
          <p>{s.mode} · {s.originPort} → {s.destinationPort}</p>
          <p>Carrier: {s.carrierName}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-6 text-sm">
        <div>
          <h2 className="text-xs uppercase tracking-wider text-foreground/60">Shipper</h2>
          <p className="font-medium">{s.shipperName}</p>
          {s.shipperTrn && <p>TRN {s.shipperTrn}</p>}
        </div>
        <div>
          <h2 className="text-xs uppercase tracking-wider text-foreground/60">Consignee</h2>
          <p className="font-medium">{s.consigneeName}</p>
          {s.consigneeTrn && <p>TRN {s.consigneeTrn}</p>}
          {s.freeZone && <p>Designated free zone</p>}
        </div>
      </section>

      {lineItems.length === 0 ? (
        <p className="text-sm text-foreground/60">No line items yet. Upload the commercial invoice first.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-foreground/30 text-left">
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-2">Description</th>
              <th className="py-2 pr-2">HS code</th>
              <th className="py-2 pr-2 text-right">Qty</th>
              <th className="py-2 pr-2 text-right">Weight (kg)</th>
              <th className="py-2 text-right">Volume (m³)</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((l) => (
              <tr key={l.id} className="border-b border-foreground/10 align-top">
                <td className="py-2 pr-2 tabular-nums">{l.lineNo}</td>
                <td className="py-2 pr-2">{l.description}{l.restricted && <span className="ml-1 font-semibold">(restricted)</span>}</td>
                <td className="py-2 pr-2 font-mono">{l.hsCode ?? '—'}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{Number(l.quantity).toLocaleString('en-US')} {l.unit}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{l.weightKg ? Number(l.weightKg).toLocaleString('en-US') : '—'}</td>
                <td className="py-2 text-right tabular-nums">{l.volumeCbm ? Number(l.volumeCbm).toLocaleString('en-US') : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="py-2" colSpan={4}>Totals ({lineItems.length} lines)</td>
              <td className="py-2 pr-2 text-right tabular-nums">{weight.toLocaleString('en-US', { maximumFractionDigits: 3 })}</td>
              <td className="py-2 text-right tabular-nums">{volume.toLocaleString('en-US', { maximumFractionDigits: 3 })}</td>
            </tr>
          </tfoot>
        </table>
      )}

      <footer className="mt-8 grid grid-cols-2 gap-8 text-sm">
        <div className="border-t border-foreground/40 pt-2">Packed by (name &amp; signature)</div>
        <div className="border-t border-foreground/40 pt-2">Received by (name, signature &amp; date)</div>
      </footer>
    </article>
  )
}

export default function PackingSlipPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-foreground/5" />}>
      <Slip params={props.params} />
    </Suspense>
  )
}
