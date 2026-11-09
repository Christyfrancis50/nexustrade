import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Not allowed · NexusTrade' }

export default function ForbiddenPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-foreground/60">403</p>
      <h1 className="text-3xl font-semibold tracking-tight">This workspace isn&apos;t for your role</h1>
      <p className="max-w-md text-sm text-foreground/60">Each workspace is limited to one role. Head back to yours.</p>
      <Link href="/workspace" className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background">
        Go to my workspace
      </Link>
    </main>
  )
}
