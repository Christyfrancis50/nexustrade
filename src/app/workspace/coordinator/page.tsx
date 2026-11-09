import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { requireRole } from '@/lib/auth/session'
import { listShipments } from '@/features/shipments/queries'
import { ShipmentStatus } from '@/features/shipments/components/badges'

export const metadata: Metadata = { title: 'Coordinator · NexusTrade' }

async function Shipments() {
  const user = await requireRole('coordinator')
  const rows = await listShipments()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-foreground/60">Logistics Coordinator</p>
        <h1 className="text-3xl font-semibold tracking-tight">Shipments</h1>
        <p className="text-foreground/70">
          Welcome, {user.fullName ?? user.email}. Open a shipment to upload documents for AI extraction.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-foreground/15 p-8 text-center text-sm text-foreground/60">
          No shipments yet. Run <code>npm run db:seed</code> to load the demo data.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-foreground/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-foreground/[0.03] text-xs uppercase tracking-wider text-foreground/60">
              <tr>
                <th className="px-4 py-3 font-medium">Tracking</th>
                <th className="px-4 py-3 font-medium">Route</th>
                <th className="px-4 py-3 font-medium">Consignee</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Docs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t border-foreground/10 hover:bg-foreground/[0.02]">
                  <td className="px-4 py-3">
                    <Link href={`/workspace/coordinator/shipments/${s.id}`} className="font-mono font-medium underline-offset-4 hover:underline">
                      {s.trackingNumber}
                    </Link>
                    <div className="text-xs text-foreground/65">{s.mode}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {s.originPort} → {s.destinationPort}
                  </td>
                  <td className="px-4 py-3">{s.consigneeName}</td>
                  <td className="px-4 py-3">
                    <ShipmentStatus status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {s.documents}
                    {s.discrepancies > 0 && (
                      <span className="ml-2 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-900 dark:text-amber-200" title="Documents with discrepancies">
                        ⚠ {s.discrepancies}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function CoordinatorPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-foreground/5" />}>
      <Shipments />
    </Suspense>
  )
}
