import { describe, expect, it } from 'vitest'
import { ROLE_INFO, USER_ROLES, isUserRole, roleForPath, safeNextPath } from './roles'

describe('roles', () => {
  it('recognises only the three roles', () => {
    expect(USER_ROLES).toEqual(['coordinator', 'broker', 'finance'])
    expect(isUserRole('broker')).toBe(true)
    expect(isUserRole('admin')).toBe(false)
    expect(isUserRole(undefined)).toBe(false)
  })

  it('maps workspace paths to their owning role', () => {
    expect(roleForPath('/workspace/finance')).toBe('finance')
    expect(roleForPath('/workspace/broker/queue/42')).toBe('broker')
    expect(roleForPath('/workspace')).toBeNull()
    expect(roleForPath('/workspace/admin')).toBeNull()
    expect(roleForPath('/login')).toBeNull()
  })

  it('every role home lives under its own workspace path', () => {
    for (const role of USER_ROLES) expect(roleForPath(ROLE_INFO[role].home)).toBe(role)
  })

  it('blocks open redirects after sign-in', () => {
    expect(safeNextPath('/workspace/finance')).toBe('/workspace/finance')
    expect(safeNextPath('//evil.com')).toBe('/workspace')
    expect(safeNextPath('/\\evil.com')).toBe('/workspace')
    expect(safeNextPath('https://evil.com')).toBe('/workspace')
    expect(safeNextPath('/x\nSet-Cookie:a')).toBe('/workspace')
    expect(safeNextPath(null)).toBe('/workspace')
  })
})
