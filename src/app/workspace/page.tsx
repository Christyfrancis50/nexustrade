import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/session'
import { ROLE_INFO } from '@/lib/auth/roles'

async function GoToRoleHome(): Promise<never> {
  const user = await requireUser()
  redirect(ROLE_INFO[user.role].home)
}

export default function WorkspaceIndex() {
  return (
    <Suspense fallback={<p className="text-sm text-foreground/60">Opening your workspace…</p>}>
      <GoToRoleHome />
    </Suspense>
  )
}
