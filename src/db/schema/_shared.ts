import { sql, type SQL } from 'drizzle-orm'
import { numeric, pgEnum, timestamp } from 'drizzle-orm/pg-core'
import type { UserRole } from '../../lib/auth/roles'

export const currency = pgEnum('currency', ['AED', 'USD', 'EUR', 'GBP'])

/** Money: numeric(14,2), read as a string; convert with toMinor() from lib/money. */
export const money = () => numeric({ precision: 14, scale: 2 })
/** FX rates: units of AED per 1 unit of the foreign currency. */
export const rate = () => numeric({ precision: 18, scale: 8 })

export const createdAt = () => timestamp({ withTimezone: true }).defaultNow().notNull()

/**
 * RLS predicate: the caller's role (from private.current_user_role(), not exposed by the API) is one of `roles`.
 * Roles are compile-time constants, so sql.raw is safe here.
 * Wrapped in a sub-select so Postgres evaluates it once per statement, not per row.
 */
export function roleIn(...roles: UserRole[]): SQL {
  return sql.raw(`(select private.current_user_role()) in (${roles.map((r) => `'${r}'`).join(', ')})`)
}

export const ANY_ROLE = roleIn('coordinator', 'broker', 'finance')
