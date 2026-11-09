---
trigger: always_on
---

# NexusTrade engineering rules

## Stack (do not substitute without asking)
- Next.js 15 App Router, React Server Components, Server Actions for mutations
- TypeScript `strict: true`, no `any` (use `unknown` and narrow it)
- Zod at every boundary: forms, Server Actions, route handlers, AI output, webhooks, env vars
- Tailwind CSS, shadcn/ui (Radix primitives), lucide-react, Recharts
- PostgreSQL (Supabase free tier) through Drizzle ORM, with migrations committed under `drizzle/`
- pgvector for HS-code semantic search
- Vercel AI SDK for extraction, behind a provider interface with a `MockExtractionProvider` so the app runs without API keys
- Stripe in **test mode only**
- Vitest for unit tests, Playwright for end-to-end tests

## Money and ledger: non-negotiable
- Never use JS floats for money. Store `numeric(14,2)` and compute with integer minor units (fils/cents) or `decimal.js`.
- The ledger is **append-only double-entry**. No UPDATE or DELETE on `ledger_entries`; corrections are reversing entries. Enforce this with a DB trigger or revoked privileges.
- Every posted transaction balances: the sum of debits equals the sum of credits, checked in the same DB transaction.
- Balances are always **derived** from entries, never stored as an editable column.
- Every invoice, payout or escrow-release request requires an `Idempotency-Key` (UUID). It has a unique constraint; a retry with the same key returns the original result.
- Wrap multi-table money writes in a single DB transaction.
- The base currency is AED. Store the original currency, amount, FX rate and rate timestamp on every converted entry.

## Tax
- UAE VAT: 5% standard rate, 0% for zero-rated exports, exempt for designated free-zone supplies. Keep the rules in one pure, unit-tested module (`src/lib/tax`).
- Compute VAT per line, then round half-up to 2 decimals.

## AI
- AI output is untrusted: validate it with Zod, show a confidence score, and require human approval (customs broker) before a value affects money.
- Always recompute totals and flag differences from the extracted totals; never trust model math.

## Security
- Auth through Supabase Auth, with three roles: `coordinator`, `broker`, `finance`. Enforce them in Server Actions **and** with Postgres RLS.
- Validate uploads by type (PDF/PNG/JPEG via magic bytes) and size (≤10 MB), and store them in a private bucket accessed through signed URLs.
- Verify Stripe webhooks by signature, and make the handlers idempotent.
- Keep secrets only in env vars, parsed by a Zod `env.ts`. Commit `.env.example`, never `.env`.
- Set security headers and a CSP in `next.config` or middleware. Rate-limit the auth, upload and AI routes.

## Code style
- Feature folders: `src/features/<module>/{actions,components,schemas,queries}.ts`
- Server-only code is marked with `import 'server-only'`
- Make small, reviewable commits with conventional commit messages
