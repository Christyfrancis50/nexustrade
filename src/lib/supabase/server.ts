import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { supabaseConfig } from './config'

/** Per-request Supabase client for Server Components, Server Actions and Route Handlers. */
export async function createSupabaseServerClient() {
  const config = supabaseConfig()
  if (!config) return null
  // The auth client reads the clock (Date.now) to check session expiry. Under Cache
  // Components that is not allowed while prerendering, so mark everything after this
  // point as request-time. Auth-dependent UI is per-user anyway.
  await connection()
  const cookieStore = await cookies()
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options)
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Safe to ignore: the proxy refreshes the session on every request.
        }
      },
    },
  })
}
