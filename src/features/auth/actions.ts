'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/auth/roles'
import { signInSchema, type SignInState } from './schemas'

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') ?? undefined,
  })
  const email = typeof formData.get('email') === 'string' ? String(formData.get('email')) : undefined

  if (!parsed.success) {
    const fieldErrors: SignInState['fieldErrors'] = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]
      if ((key === 'email' || key === 'password') && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { fieldErrors, email }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) return { error: 'Sign-in is not configured yet. Add your Supabase keys to .env.', email }

  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password })
  // Same message for unknown email and wrong password: don't reveal which accounts exist.
  if (error) return { error: 'Incorrect email or password.', email }

  redirect(safeNextPath(parsed.data.next))
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  await supabase?.auth.signOut()
  redirect('/login')
}
