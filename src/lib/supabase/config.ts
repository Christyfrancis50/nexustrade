import { env } from '@/env'

/** Supabase URL + anon key, or null when auth isn't configured yet (e.g. CI, fresh clone). */
export function supabaseConfig(): { url: string; anonKey: string } | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return url && anonKey ? { url, anonKey } : null
}
