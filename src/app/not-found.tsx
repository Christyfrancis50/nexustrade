import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-foreground/60">404</p>
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-md text-sm text-foreground/60">That shipment, document or page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link href="/workspace" className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background">
        Go to my workspace
      </Link>
    </main>
  )
}
