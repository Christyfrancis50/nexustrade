import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/env'

let admin: SupabaseClient | null | undefined

/**
 * Service-role client: bypasses RLS. Server-only, and only used after an
 * explicit role check (e.g. storage writes for an authorised coordinator).
 */
export function supabaseAdmin(): SupabaseClient | null {
  if (admin !== undefined) return admin
  admin =
    env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
      : null
  return admin
}
