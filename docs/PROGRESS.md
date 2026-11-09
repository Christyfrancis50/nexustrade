# Build progress

| Phase | Status |
|---|---|
| 1. Scaffold | ✅ Done |
| 2. Auth & roles | ⏭ Next |
| 3. Schema & seed | ⬜ |
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

## Next: Phase 2 (Auth & roles)
Needs a free Supabase project: put `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`.
