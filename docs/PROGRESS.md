# Build progress

| Phase | Status |
|---|---|
| 1. Scaffold | ✅ Done |
| 2. Auth & roles | ✅ Built (needs your Supabase keys to try live) |
| 3. Schema & seed | ✅ Done (load into Supabase with db:migrate + db:seed) |
| 4. Ledger, tax & FX engine | ✅ Done |
| 5. Module A: document AI | ⏭ Next |
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

## Phase 3: Schema & seed ✅
**Delivered**
- **Tables** (Drizzle, snake_case): `shipments`, `documents`, `line_items`, `hs_codes` (with a `vector(384)` embedding and an HNSW index), `classification_decisions`, `accounts`, `invoices`, `ledger_transactions`, `ledger_entries`, `escrow_milestones`, `payouts`, `fx_rates`, `idempotency_keys`, `audit_log`, plus an `account_balances` view.
- **Database-level guarantees**, not just app code:
  - check constraints for UN/LOCODEs, 15-digit TRNs, HS-code format, upload type and size (≤10 MB), positive amounts, invoice `total = subtotal + VAT + duty`, VAT rate matching the tax treatment, and escrow "released ⇔ released_at"
  - unique idempotency keys on invoices, ledger transactions and payouts
  - migration `0004`: ledger transactions, ledger entries and the audit log are **append-only** (UPDATE, DELETE and TRUNCATE are blocked), and a deferred constraint trigger rejects any **unbalanced** transaction (debits ≠ credits in AED, or fewer than two lines) at COMMIT
- **RLS on every table**, by role: everyone reads shipments, documents and line items; coordinators create them; brokers record HS decisions; only finance reads the ledger, payouts and audit log. **There are no write policies on money tables**, so money can only be written by Server Actions on the server connection.
- `src/lib/tax/invoice.ts`: line totals with 3-dp quantities, per-line duty, UAE VAT on value + duty (5% standard, 0% zero-rated or exempt), AED conversion. `convert()` added to the money helpers.
- **Seed** (`npm run db:seed`, safe to re-run): 10-account chart, 51 real HS 2022 subheadings with indicative GCC duty and restricted flags, FX rates (USD peg 3.6725), and 6 demo shipments across every status with documents, line items, invoices and 10/40/50 escrow milestones. Shipment 0003 is on customs hold because its invoice total doesn't match its line items.
- **Real-Postgres tests**: `test/pglite.ts` boots Postgres 17 + pgvector in-process (PGlite), mimics Supabase's auth schema and roles, and applies every migration. 21 database tests cover the guards, RLS and the seed. No Docker or cloud database needed, and it runs in CI.

**Decisions**
- Ledger history is seeded in Phase 4, once the posting engine exists, so seed data goes through the same balanced-posting path as real data.
- Duty rates are labelled indicative. Phase 6 expands HS codes to 300+ and adds embeddings.

**Checks:** lint ✅ · typecheck ✅ · unit + DB tests 44/44 ✅ · drizzle-kit check ✅ · build ✅ · e2e 4 passed, 1 skipped (needs Supabase keys) · npm audit 0 vulnerabilities

## Phase 4: Ledger, tax & FX engine ✅
**Delivered**
- `src/lib/ledger/entries.ts`, **posting rules** for each business event:
  - escrow funded: Dr Cash / Cr Escrow
  - milestone released: Dr Escrow / Cr Carrier Payable
  - carrier paid: Dr Carrier Payable / Cr Cash
  - invoice issued: Dr Receivable / Cr Goods Revenue + Duty Payable + VAT Payable
  - reversal: every line flipped
  `withAed()` requires balance **in each original currency** (no hidden FX trades) and absorbs per-line AED rounding so AED totals balance exactly.
- `src/lib/ledger/post.ts`, the **posting engine**:
  - `postTransaction` is idempotent: the same key and request replays the original, a different request with the same key is rejected, and a failed posting leaves nothing behind
  - `reverseTransaction` posts the exact opposite; a transaction can be reversed only once (enforced by a unique index in migration `0005`) and reversals can't be reversed
  - `accountBalances` derives balances from entries
- `src/lib/idempotency.ts`: key format rules and stable request hashing.
- `src/lib/fx/`, the **FX service**: free ECB feed (Frankfurter), crossed through the official USD peg (3.6725) because the ECB has no AED; exact 8-dp decimal division; cached in `fx_rates` (12 h); falls back to stale cache, then indicative constants, so it never hard-fails. Every posting stores its rate, so history never changes.
- **Seed ledger history** now goes through the real engine: 22 transactions (escrow funding, invoices, milestone releases, simulated carrier payouts), released milestones linked to their transactions, payouts recorded. The seed no longer deletes demo shipments on re-run, because ledger history is append-only.

**Checks:** lint ✅ · typecheck ✅ · tests 75/75 ✅ (ledger, FX and seed against real Postgres via PGlite) · drizzle-kit check ✅ · build ✅ · e2e 4 passed, 1 skipped (needs Supabase keys) · npm audit 0 vulnerabilities

## Next: Phase 5 (Module A: document upload & AI extraction)
