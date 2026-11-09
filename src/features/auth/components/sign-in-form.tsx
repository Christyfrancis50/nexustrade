'use client'

import { useActionState } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn } from '../actions'
import type { SignInState } from '../schemas'

export function SignInForm({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {})
  const next = useSearchParams().get('next') ?? ''

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Work email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={state.fieldErrors?.email ? 'email-error' : undefined}
          className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2.5 text-base font-normal outline-none focus:border-foreground/50"
        />
        {state.fieldErrors?.email && (
          <span id="email-error" className="text-xs font-normal text-red-600 dark:text-red-400">
            {state.fieldErrors.email}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby={state.fieldErrors?.password ? 'password-error' : undefined}
          className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2.5 text-base font-normal outline-none focus:border-foreground/50"
        />
        {state.fieldErrors?.password && (
          <span id="password-error" className="text-xs font-normal text-red-600 dark:text-red-400">
            {state.fieldErrors.password}
          </span>
        )}
      </label>

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || disabled}
        className="mt-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity disabled:opacity-50"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
