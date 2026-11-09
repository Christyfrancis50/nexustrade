import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Runs before every page request:
 *  1. Refreshes the Supabase session cookie so Server Components see a valid token.
 *  2. Sends signed-out visitors away from /workspace to /login (fast path).
 *
 * This is a convenience, not the security boundary: every workspace page and
 * Server Action re-checks the user and role itself (see src/lib/auth/session.ts),
 * and Postgres RLS enforces access at the data layer.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const isWorkspace = request.nextUrl.pathname.startsWith('/workspace')

  let signedIn = false
  if (url && anonKey) {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) request.cookies.set(name, value)
          response = NextResponse.next({ request })
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options)
        },
      },
    })
    // getClaims() verifies the JWT; never trust getSession() on the server.
    const { data } = await supabase.auth.getClaims()
    signedIn = Boolean(data?.claims?.sub)
  }

  if (isWorkspace && !signedIn) {
    const login = request.nextUrl.clone()
    login.pathname = '/login'
    login.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`
    return NextResponse.redirect(login)
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
