# Build progress

| Phase | Status |
|---|---|
| 1. Scaffold | ✅ Done |
| 2. Auth & roles | ✅ Built (needs your Supabase keys to try live) |
| 3. Schema & seed | ⏭ Next |
| 4. Ledger, tax & FX engine | ⬜ |
| 5. Module A: document AI | ⬜ |
| 6. Module B: HS classifier | ⬜ |
| 7. Module D: escrow & Stripe | ⬜ |
| 8. Module E: dashboards & exports | ⬜ |
| 9. Hardening | ⬜ |

## Phase 1: Scaffold ✅
Started by the Antigravity agent (Next.js 16.4 app, Tailwind v4, Zod, Drizzle packages); finished in Claude Code after Antigravity's Claude credits ran out.

**Delivered**
- Next.js 16.4 App Router, React 19.3, TypeScript strict (+ `noUncheckedIndexedAccess`, target ES2022 for `bigint`), Tailwind v4, Cache Components + Partial Prefetching on.
- `src/env.ts`: Zod-validated env. Every key is optional so the app runs with none; blank values count as unset; **live Stripe keys are rejected**; a real AI provider requires its key. `.env.example` documents all of them.
- `src/lib/money.ts`: integer minor-unit money helpers (`bigint`), half-up basis-point rounding for VAT, formatting. Unit-tested.
- Drizzle: `drizzle.config.ts` (loads `.env` via Node's built-in `process.loadEnvFile`), lazy `db()` client in `src/db/index.ts` (`prepare: false` for Supabase's pooler), empty schema barrel, placeholder seed.
- Security headers (HSTS, nosniff, frame DENY, Referrer/Permissions/COOP) and `poweredByHeader: false`.
- Tests: Vitest (10 unit tests), Playwright smoke test against the production server checking the page and headers.
- CI: GitHub Actions running lint → typecheck → unit tests → `npm audit` → build → Playwright. Dependabot for npm and Actions.
- Branded placeholder home page.

**Decisions**
- `next lint` was removed in Next 16, so `lint` runs `eslint .` directly.
- `@types/node` bumped to v22 to satisfy Vitest 5's peer range.
- `drizzle/meta/` is no longer git-ignored: migration journals must be committed.
- Nonce-based CSP deferred to Phase 9, when Supabase and Stripe origins are known.

**Checks:** lint ✅ · typecheck ✅ · unit tests 10/10 ✅ · build ✅ · e2e 1/1 ✅

## Phase 2: Auth & roles ✅
**Delivered**
- `profiles` table (Drizzle) with a `user_role` enum (coordinator, broker, finance) and **RLS**: users can read only their own row; there are no write policies, so nobody can change their own role.
- Migration `0001`: `on_auth_user_created` trigger creates a profile for each new auth user, taking the role from `app_metadata` (service-role only, never user-editable metadata); `current_user_role()` helper for later RLS policies.
- Supabase SSR clients and `src/proxy.ts` (Next 16's replacement for middleware): refreshes the session and redirects signed-out visitors from `/workspace` to `/login?next=…`.
- `requireUser()` / `requireRole()`: verified with `getClaims()` and re-checked on every page, not just in the proxy. Session reads sit inside `<Suspense>` as Cache Components requires.
- `/login` (Zod-validated Server Action, one error message for wrong email or password, open-redirect-safe `next`), sign-out, `/forbidden`, and three role workspaces.
- `npm run auth:demo-users` creates one demo account per role in your Supabase project.

**Decisions**
- No public sign-up: accounts are created by an admin, which suits a B2B tool and keeps roles trustworthy.
- Auth degrades gracefully: with no Supabase keys the site still builds and runs, and the sign-in form explains what's missing.

**Checks:** lint ✅ · typecheck ✅ · unit tests 16/16 ✅ · build ✅ · e2e 4 passed, 1 skipped until Supabase keys are set

### To try sign-in live
1. Create a free project at supabase.com.
2. Copy `.env.example` to `.env`. Fill in `DATABASE_URL` (transaction pooler, port 6543), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and a `DEMO_USER_PASSWORD` of 12+ characters.
3. `npm run db:migrate`, then `npm run auth:demo-users`, then `npm run dev`.
4. Sign in as coordinator@nexustrade.test, broker@nexustrade.test or finance@nexustrade.test.

## Next: Phase 3 (Schema & seed)
