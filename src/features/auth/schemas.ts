import { z } from 'zod'

export const signInSchema = z.object({
  // Trim and lowercase first, then validate (z.email() alone rejects surrounding spaces).
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  next: z.string().optional(),
})

export type SignInState = {
  error?: string
  fieldErrors?: Partial<Record<'email' | 'password', string>>
  email?: string
}
