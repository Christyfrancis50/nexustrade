import Link from 'next/link'

export function FinanceTabs({ active }: { active: 'escrow' | 'reports' }) {
  const tab = (key: 'escrow' | 'reports', href: string, label: string) => (
    <Link
      href={href}
      aria-current={active === key ? 'page' : undefined}
      className={`rounded-md px-3 py-1.5 text-sm ${active === key ? 'bg-foreground text-background' : 'text-foreground/70 hover:bg-foreground/5'}`}
    >
      {label}
    </Link>
  )
  return (
    <nav aria-label="Finance sections" className="flex gap-1">
      {tab('escrow', '/workspace/finance', 'Escrow & payouts')}
      {tab('reports', '/workspace/finance/reports', 'Reports & exports')}
    </nav>
  )
}
