import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { z } from 'zod'
import { requireRole } from '@/lib/auth/session'
import { formatMoney, toMinor, type Currency } from '@/lib/money'
import { getShipment } from '@/features/shipments/queries'
import { ExtractionStatus, humanize, ShipmentStatus } from '@/features/shipments/components/badges'
import { UploadForm } from '@/features/documents/components/upload-form'
import { reviewDocument } from '@/features/documents/actions'
import { describeFlag, type Flag } from '@/features/documents/reconcile'

export const metadata: Metadata = { title: 'Shipment · NexusTrade' }

const money = (v: string | null, c: string) => (v === null ? '—' : formatMoney(toMinor(v), c as Currency))

async function ShipmentDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('coordinator')
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const data = await getShipment(id)
  if (!data) notFound()
  const { shipment: s, documents, lineItems } = data

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/workspace/coordinator" className="text-sm text-foreground/60 hover:text-foreground">
          ← All shipments
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-3xl font-semibold tracking-tight">{s.trackingNumber}</h1>
          <ShipmentStatus status={s.status} />
        </div>
        <dl className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-foreground/50">Route</dt><dd className="font-mono">{s.originPort} → {s.destinationPort} · {s.mode}</dd></div>
          <div><dt className="text-foreground/50">Shipper</dt><dd>{s.shipperName}</dd></div>
          <div><dt className="text-foreground/50">Consignee</dt><dd>{s.consigneeName}{s.freeZone ? ' (free zone)' : ''}</dd></div>
          <div><dt className="text-foreground/50">Freight</dt><dd className="tabular-nums">{money(s.freightAmount, s.freightCurrency)}</dd></div>
        </dl>
      </div>

      <UploadForm shipmentId={s.id} />

      <section className="flex flex-col gap-3" aria-labelledby="docs">
        <h2 id="docs" className="font-medium">Documents ({documents.length})</h2>
        {documents.length === 0 && <p className="text-sm text-foreground/60">No documents yet.</p>}
        <ul className="flex flex-col gap-3">
          {documents.map((d) => {
            const flags = (d.flags as Flag[]) ?? []
            return (
              <li key={d.id} className={`rounded-xl border p-4 ${d.hasDiscrepancy ? 'border-amber-500/40' : 'border-foreground/10'}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="font-medium">{humanize(d.type)} {d.documentNumber && <span className="font-mono text-sm text-foreground/60">· {d.documentNumber}</span>}</span>
                    <span className="text-xs text-foreground/50">
                      {d.originalFilename} · {(d.sizeBytes / 1024).toFixed(0)} KB{d.extractionProvider ? ` · read by ${d.extractionProvider}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ExtractionStatus status={d.extractionStatus} />
                    {!d.storagePath.startsWith('seed/') && (
                      <a href={`/api/documents/${d.id}/file`} target="_blank" rel="noopener noreferrer" className="rounded-md px-2 py-1 text-sm text-foreground/70 hover:bg-foreground/5">
                        View file
                      </a>
                    )}
                    {d.extractionStatus === 'EXTRACTED' && (
                      <form action={reviewDocument}>
                        <input type="hidden" name="documentId" value={d.id} />
                        <input type="hidden" name="shipmentId" value={s.id} />
                        <button className="rounded-md border border-foreground/15 px-2 py-1 text-sm hover:bg-foreground/5">Mark reviewed</button>
                      </form>
                    )}
                  </div>
                </div>
                {(d.statedTotal || d.computedTotal) && (
                  <p className="mt-2 text-sm tabular-nums text-foreground/70">
                    Stated {d.statedTotal ?? '—'} · Recomputed {d.computedTotal ?? '—'}
                  </p>
                )}
                {d.extractionError && <p className="mt-2 text-sm text-red-700 dark:text-red-300">{d.extractionError}</p>}
                {flags.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-sm text-amber-900 dark:text-amber-200">
                    {flags.map((f, i) => <li key={i}>{describeFlag(f)}</li>)}
                  </ul>
                )}
                {d.hasDiscrepancy && flags.length === 0 && (
                  <p className="mt-2 text-sm text-amber-900 dark:text-amber-200">The stated total does not match the line items.</p>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="lines">
        <h2 id="lines" className="font-medium">Line items ({lineItems.length})</h2>
        {lineItems.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-foreground/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-foreground/[0.03] text-xs uppercase tracking-wider text-foreground/60">
                <tr>
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-4 py-2 font-medium">Description</th>
                  <th className="px-4 py-2 text-right font-medium">Qty</th>
                  <th className="px-4 py-2 text-right font-medium">Unit price</th>
                  <th className="px-4 py-2 font-medium">HS code</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((l) => (
                  <tr key={l.id} className="border-t border-foreground/10">
                    <td className="px-4 py-2 tabular-nums text-foreground/50">{l.lineNo}</td>
                    <td className="px-4 py-2">{l.description}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{Number(l.quantity).toLocaleString('en-US')} {l.unit}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(l.unitPrice, l.currency)}</td>
                    <td className="px-4 py-2 font-mono text-xs">{l.hsCode ?? <span className="text-foreground/40">{humanize(l.hsStatus)}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default function ShipmentPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-foreground/5" />}>
      <ShipmentDetail params={props.params} />
    </Suspense>
  )
}
