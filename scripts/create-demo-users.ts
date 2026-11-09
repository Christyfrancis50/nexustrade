/**
 * Creates one demo user per role in YOUR Supabase project (idempotent).
 *   npm run auth:demo-users
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DEMO_USER_PASSWORD in .env.
 * Roles are set in app_metadata, which only the service role can write;
 * the `on_auth_user_created` trigger copies it into public.profiles.
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { USER_ROLES } from '../src/lib/auth/roles'

async function main() {
  const env = z
    .object({
      NEXT_PUBLIC_SUPABASE_URL: z.url(),
      SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
      DEMO_USER_PASSWORD: z.string().min(12, 'DEMO_USER_PASSWORD must be at least 12 characters'),
    })
    .parse(process.env)

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const NAMES = { coordinator: 'Layla Coordinator', broker: 'Omar Broker', finance: 'Sara Finance' } as const

  for (const role of USER_ROLES) {
    const email = `${role}@nexustrade.test`
    const { error } = await admin.auth.admin.createUser({
      email,
      password: env.DEMO_USER_PASSWORD,
      email_confirm: true,
      app_metadata: { role },
      user_metadata: { full_name: NAMES[role] },
    })
    if (!error) console.log(`✓ created ${email} (${role})`)
    else if (/already (been )?registered|exists/i.test(error.message)) console.log(`• ${email} already exists`)
    else {
      console.error(`✗ ${email}: ${error.message}`)
      process.exitCode = 1
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
