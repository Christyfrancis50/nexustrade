import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { SignInForm } from '@/features/auth/components/sign-in-form'
import { supabaseConfig } from '@/lib/supabase/config'

export const metadata: Metadata = { title: 'Sign in · NexusTrade' }

export default function LoginPage() {
  const configured = supabaseConfig() !== null

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Link href="/" className="font-mono text-xs uppercase tracking-[0.2em] text-foreground/60">
            NexusTrade
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">Sign in to your workspace</h1>
          <p className="text-sm text-foreground/60">Coordinators, customs brokers and finance controllers each get their own view.</p>
        </div>

        {!configured && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            Auth isn&apos;t configured yet. Add your Supabase URL and anon key to <code>.env</code>.
          </p>
        )}

        <Suspense fallback={<div className="h-64" />}>
          <SignInForm disabled={!configured} />
        </Suspense>
      </div>
    </main>
  )
}
