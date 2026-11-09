import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isUserRole, type UserRole } from './roles'

export type SessionUser = {
  id: string
  email: string
  fullName: string | null
  role: UserRole
}

/**
 * The verified current user with their role, or null. Deduplicated per request.
 * Reads cookies, so callers must render inside <Suspense> (Cache Components).
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return null

  const { data } = await supabase.auth.getClaims()
  const id = data?.claims?.sub
  if (!id) return null

  // RLS only returns the caller's own row.
  const { data: profile } = await supabase.from('profiles').select('email, full_name, role').eq('id', id).maybeSingle()
  if (!profile || !isUserRole(profile.role)) return null

  return { id, email: profile.email, fullName: profile.full_name, role: profile.role }
})

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return user
}

/** Use at the top of every role-scoped page and Server Action. */
export async function requireRole(...allowed: UserRole[]): Promise<SessionUser> {
  const user = await requireUser()
  if (!allowed.includes(user.role)) redirect('/forbidden')
  return user
}
