import { sql } from 'drizzle-orm'
import { pgEnum, pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { authenticatedRole, authUid, authUsers } from 'drizzle-orm/supabase'
import { USER_ROLES, type UserRole } from '../../lib/auth/roles'

export { USER_ROLES, type UserRole }
export const userRole = pgEnum('user_role', USER_ROLES)

/**
 * One row per Supabase Auth user, created by the `on_auth_user_created` trigger.
 * Role comes from `app_metadata.role` (only settable with the service-role key),
 * never from user-editable `user_metadata`.
 *
 * RLS: users can read their own profile. No insert/update/delete policies exist,
 * so only the trigger (security definer) and the service role can write. Users
 * therefore cannot promote themselves.
 */
export const profiles = pgTable(
  'profiles',
  {
    id: uuid()
      .primaryKey()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    email: text().notNull(),
    fullName: text(),
    role: userRole().default('coordinator').notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    pgPolicy('profiles_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${t.id} = ${authUid}`,
    }),
  ],
).enableRLS()

export type Profile = typeof profiles.$inferSelect
