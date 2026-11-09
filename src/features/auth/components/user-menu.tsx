import { requireUser } from '@/lib/auth/session'
import { ROLE_INFO } from '@/lib/auth/roles'
import { signOut } from '../actions'

export async function UserMenu() {
  const user = await requireUser()
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden text-foreground/60 sm:inline">{user.fullName ?? user.email}</span>
      <span className="rounded-full bg-foreground/10 px-2.5 py-1 text-xs font-medium">{ROLE_INFO[user.role].label}</span>
      <form action={signOut}>
        <button type="submit" className="rounded-md px-2 py-1 text-foreground/70 hover:bg-foreground/5 hover:text-foreground">
          Sign out
        </button>
      </form>
    </div>
  )
}
