const SHIPMENT: Record<string, string> = {
  DRAFT: 'bg-foreground/10 text-foreground/70',
  IN_TRANSIT: 'bg-sky-500/15 text-sky-800 dark:text-sky-200',
  CUSTOMS_HOLD: 'bg-amber-500/15 text-amber-900 dark:text-amber-200',
  CLEARED: 'bg-violet-500/15 text-violet-800 dark:text-violet-200',
  DELIVERED: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
}

const EXTRACTION: Record<string, string> = {
  PENDING: 'bg-foreground/10 text-foreground/70',
  EXTRACTED: 'bg-sky-500/15 text-sky-800 dark:text-sky-200',
  REVIEWED: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
  FAILED: 'bg-red-500/15 text-red-800 dark:text-red-200',
}

const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replaceAll('_', ' ')

export function ShipmentStatus({ status }: { status: string }) {
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${SHIPMENT[status] ?? ''}`}>{label(status)}</span>
}

export function ExtractionStatus({ status }: { status: string }) {
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${EXTRACTION[status] ?? ''}`}>{label(status)}</span>
}

export { label as humanize }
