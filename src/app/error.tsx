'use client'

import { useEffect } from 'react'

/** Route-level error boundary: never shows stack traces or raw messages to users. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-foreground/60">Something went wrong</p>
      <h1 className="text-3xl font-semibold tracking-tight">We couldn&apos;t load this page</h1>
      <p className="max-w-md text-sm text-foreground/60">
        Please try again. If it keeps happening, share this reference with support:{' '}
        <code className="font-mono">{error.digest ?? 'n/a'}</code>
      </p>
      <button onClick={reset} className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background">
        Try again
      </button>
    </main>
  )
}
