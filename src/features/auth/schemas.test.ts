import { describe, expect, it } from 'vitest'
import { signInSchema } from './schemas'

describe('signInSchema', () => {
  it('normalises the email', () => {
    const r = signInSchema.parse({ email: '  Finance@NexusTrade.TEST ', password: 'longenough' })
    expect(r.email).toBe('finance@nexustrade.test')
  })

  it('rejects bad emails and short passwords', () => {
    const r = signInSchema.safeParse({ email: 'nope', password: 'short' })
    expect(r.success).toBe(false)
    const fields = r.error!.issues.map((i) => i.path[0])
    expect(fields).toEqual(expect.arrayContaining(['email', 'password']))
  })
})
