import type { Metadata } from 'next'
import { Suspense } from 'react'
import { requireRole } from '@/lib/auth/session'
import { brokerQueue } from '@/features/hs/queries'
import { LineDecision, ShipmentControls } from '@/features/hs/components/review-forms'
import { ShipmentStatus } from '@/features/shipments/components/badges'

export const metadata: Metadata = { title: 'Customs broker · NexusTrade' }

async function Queue() {
  const user = await requireRole('broker')
  const queue = await brokerQueue()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-foreground/60">Customs Broker</p>
        <h1 className="text-3xl font-semibold tracking-tight">HS review queue</h1>
        <p className="max-w-2xl text-foreground/70">
          Welcome, {user.fullName ?? user.email}. Confirm or correct the suggested HS code for each line, then clear the shipment.
          Duty figures are indicative estimates.
        </p>
      </div>

      {queue.length === 0 && (
        <p className="rounded-xl border border-dashed border-foreground/15 p-8 text-center text-sm text-foreground/60">
          Nothing waiting for customs. Shipments appear here while in transit or on hold.
        </p>
      )}

      {queue.map((s) => (
        <section key={s.id} aria-labelledby={`s-${s.id}`} className="flex flex-col gap-4 rounded-xl border border-foreground/10 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id={`s-${s.id}`} className="font-mono text-lg font-semibold">{s.trackingNumber}</h2>
              <p className="text-sm text-foreground/60">
                <span className="font-mono">{s.route}</span> · {s.consigneeName}
              </p>
            </div>
            <ShipmentStatus status={s.status} />
          </div>
          <div>
            {s.lines.length === 0 ? (
              <p className="text-sm text-foreground/60">No line items yet. The coordinator needs to upload the commercial invoice.</p>
            ) : (
              s.lines.map((l) => <LineDecision key={l.id} line={l} />)
            )}
          </div>
          <ShipmentControls
            shipmentId={s.id}
            status={s.status}
            ready={s.clearance.ready}
            blockers={s.clearance.blockers}
            hasUnclassified={s.lines.some((l) => l.hsStatus === 'UNCLASSIFIED')}
          />
        </section>
      ))}
    </div>
  )
}

export default function BrokerPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-foreground/5" />}>
      <Queue />
    </Suspense>
  )
}
