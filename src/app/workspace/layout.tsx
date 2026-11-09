import Link from 'next/link'
import { Suspense } from 'react'
import { UserMenu } from '@/features/auth/components/user-menu'

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-foreground/10">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/workspace" className="font-semibold tracking-tight">
            NexusTrade
          </Link>
          <Suspense fallback={<div className="h-8 w-48 animate-pulse rounded-md bg-foreground/5" />}>
            <UserMenu />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-10">{children}</main>
    </div>
  )
}
