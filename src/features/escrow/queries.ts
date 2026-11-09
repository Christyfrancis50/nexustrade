import 'server-only'
import { asc, desc, inArray } from 'drizzle-orm'
import { db } from '@/db'
import * as schema from '@/db/schema'
import { accountBalances } from '@/lib/ledger/post'
import { ACCOUNT } from '@/lib/ledger/entries'
import { releaseBlocker, type MilestoneKind } from './rules'

const ORDER: Record<MilestoneKind, number> = { BOOKING: 0, CUSTOMS_CLEARED: 1, DELIVERED: 2 }

export async function financeEscrowView() {
  const conn = db()
  const shipments = await conn.select().from(schema.shipments).orderBy(desc(schema.shipments.createdAt)).limit(100)
  const milestones = shipments.length
    ? await conn
        .select()
        .from(schema.escrowMilestones)
        .where(inArray(schema.escrowMilestones.shipmentId, shipments.map((s) => s.id)))
        .orderBy(asc(schema.escrowMilestones.createdAt))
    : []
  const balances = await accountBalances(conn)
  const bal = (code: string) => balances.find((b) => b.code === code)?.balanceAed ?? 0n

  return {
    totals: {
      escrowHeld: bal(ACCOUNT.ESCROW),
      carrierPayable: bal(ACCOUNT.CARRIER_PAYABLE),
      vatPayable: bal(ACCOUNT.VAT_PAYABLE),
      dutyPayable: bal(ACCOUNT.DUTY_PAYABLE),
      cash: bal(ACCOUNT.CASH),
    },
    shipments: shipments.map((s) => {
      const ms = milestones.filter((m) => m.shipmentId === s.id).sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
      const funded = ms.some((m) => m.kind === 'BOOKING' && m.status !== 'PENDING')
      return {
        id: s.id,
        trackingNumber: s.trackingNumber,
        status: s.status,
        carrierName: s.carrierName,
        freight: s.freightAmount,
        currency: s.freightCurrency,
        funded,
        canFund: s.status === 'DRAFT' && !funded && ms.length > 0,
        milestones: ms.map((m) => ({ ...m, blocker: releaseBlocker(m, s.status, funded) })),
      }
    }),
  }
}
