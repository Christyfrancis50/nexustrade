export const USER_ROLES = ['coordinator', 'broker', 'finance'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const ROLE_INFO: Record<UserRole, { label: string; home: string; summary: string }> = {
  coordinator: {
    label: 'Logistics Coordinator',
    home: '/workspace/coordinator',
    summary: 'Upload trade documents, track container transit and generate packing slips.',
  },
  broker: {
    label: 'Customs Broker',
    home: '/workspace/broker',
    summary: 'Review AI-suggested HS codes, approve duties and flag restricted goods.',
  },
  finance: {
    label: 'Finance Controller',
    home: '/workspace/finance',
    summary: 'Release escrow milestones, audit VAT and export reconciled ledgers.',
  },
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value)
}

/** Which role owns a workspace path, e.g. /workspace/broker/queue → broker. */
export function roleForPath(pathname: string): UserRole | null {
  const segment = pathname.split('/')[2]
  return isUserRole(segment) && pathname.startsWith('/workspace/') ? segment : null
}

/**
 * Only allow same-site relative paths after sign-in, to prevent open redirects
 * like `?next=//evil.com` or `?next=https://evil.com`.
 */
export function safeNextPath(next: string | null | undefined, fallback = '/workspace'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  if (/[\u0000-\u001f]/.test(next)) return fallback
  return next
}
