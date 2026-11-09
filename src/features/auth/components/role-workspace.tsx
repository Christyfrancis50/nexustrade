import { Suspense } from 'react'
import { requireRole } from '@/lib/auth/session'
import { ROLE_INFO, type UserRole } from '@/lib/auth/roles'

export type WorkspaceTool = { title: string; body: string; phase: number }

async function Gate({ role, tools }: { role: UserRole; tools: WorkspaceTool[] }) {
  const user = await requireRole(role)
  const info = ROLE_INFO[role]
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-foreground/60">{info.label}</p>
        <h1 className="text-3xl font-semibold tracking-tight">Welcome, {user.fullName ?? user.email.split('@')[0]}</h1>
        <p className="max-w-2xl text-foreground/70">{info.summary}</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((t) => (
          <li key={t.title} className="rounded-xl border border-foreground/10 p-5">
            <span className="font-mono text-xs text-foreground/50">Arrives in phase {t.phase}</span>
            <h2 className="mt-1 font-medium">{t.title}</h2>
            <p className="mt-2 text-sm text-foreground/70">{t.body}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Role-gated workspace shell. The role check runs on every request, inside Suspense. */
export function RoleWorkspace(props: { role: UserRole; tools: WorkspaceTool[] }) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-foreground/5" />}>
      <Gate {...props} />
    </Suspense>
  )
}
