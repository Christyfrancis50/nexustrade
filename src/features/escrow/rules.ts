export type MilestoneKind = 'BOOKING' | 'CUSTOMS_CLEARED' | 'DELIVERED'
export type MilestoneStatus = 'PENDING' | 'LOCKED' | 'RELEASED'
export type ShipmentStatus = 'DRAFT' | 'IN_TRANSIT' | 'CUSTOMS_HOLD' | 'CLEARED' | 'DELIVERED'

/**
 * Release policy (Module D):
 *  - the importer funds the full freight into escrow at booking
 *  - 40% (CUSTOMS_CLEARED) can be released once customs has cleared the goods
 *  - the 10% booking deposit and the final 50% are released on proof of delivery
 * Releases are done by a finance controller (four-eyes), never automatically.
 * Returns the reason a release isn't allowed, or null when it is.
 */
export function releaseBlocker(
  milestone: { kind: MilestoneKind; status: MilestoneStatus },
  shipmentStatus: ShipmentStatus,
  funded: boolean,
): string | null {
  if (milestone.status === 'RELEASED') return 'Already released'
  if (!funded) return 'Escrow has not been funded yet'
  if (milestone.kind === 'CUSTOMS_CLEARED')
    return shipmentStatus === 'CLEARED' || shipmentStatus === 'DELIVERED' ? null : 'Waiting for customs clearance'
  return shipmentStatus === 'DELIVERED' ? null : 'Waiting for proof of delivery'
}

export const MILESTONE_LABEL: Record<MilestoneKind, string> = {
  BOOKING: 'Booking deposit (10%)',
  CUSTOMS_CLEARED: 'Customs cleared (40%)',
  DELIVERED: 'Delivered (50%)',
}
