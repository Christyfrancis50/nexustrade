# Security review (Phase 9)

Run against commit history up to Phase 9, following `.agent/workflows/security-check.md`. Severity: 🔴 high · 🟠 medium · 🟡 low · ✅ pass.

## Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Dependency vulnerabilities (`npm audit --omit=dev`) | ✅ 0 found | CI runs it on every push; Dependabot weekly |
| 2 | Secrets in tracked files (Stripe, Supabase JWT, Google, Anthropic key patterns) | ✅ none | `.env*` git-ignored except `.env.example` (empty values) |
| 3 | `any` types | ✅ none | TypeScript strict + `noUncheckedIndexedAccess` |
| 4 | Floats on money | ✅ none | Integer minor units (`bigint`) everywhere. Two `Number()` uses are an integer basis-point rate and Stripe's integer amount, now bounded |
| 5 | Every Server Action validates input (Zod) and checks role | ✅ | `requireRole` in every action except sign-in and sign-out (public by design) |
| 6 | RLS enabled on every table | ✅ | `src/db/integrity.test.ts` queries `pg_tables` in real Postgres |
| 7 | Money tables can't be written through the public API, even by finance | ✅ | No write policies; tested as the `authenticated` role |
| 8 | Ledger is append-only and every transaction balances | ✅ | DB triggers (migration 0004) + tests for UPDATE, DELETE, TRUNCATE and unbalanced commits |
| 9 | Stripe webhook verifies signatures on the raw body, refuses live mode, idempotent | ✅ | `webhook.test.ts` signs real payloads; tampered payloads and wrong secrets rejected |
| 10 | Security headers and CSP | ✅ / 🟡 | `e2e/security.spec.ts`: no CSP violations, no `unsafe-eval` in production, `frame-ancestors 'none'`, `object-src 'none'` (see finding F1) |
| 11 | Rate limiting on sign-in, upload/AI, exports, checkout | ✅ | `src/lib/rate-limit.ts` (Upstash when configured) |
| 12 | Upload validation | ✅ | Magic-byte type check, 10 MB limit (app and DB), server-generated storage keys, private bucket, 5-minute signed URLs |
| 13 | Authentication | ✅ | `getClaims()` (verified JWT), never `getSession()` on the server; no user enumeration; open-redirect-safe `next` |
| 14 | Role escalation | ✅ | Role comes from `app_metadata` (service role only); trigger ignores unknown roles; no profile write policy |
| 15 | CSV / formula injection in exports | ✅ | `lib/csv.ts` neutralises `= + - @` cells; tested |
| 16 | Raw HTML injection | ✅ | No `dangerouslySetInnerHTML`, `innerHTML` or `eval` in `src/` |
| 17 | Error disclosure | ✅ | `error.tsx` shows only a digest; actions return generic messages and log details server-side |
| 18 | AI output trusted for money | ✅ | Zod-validated, totals recomputed, broker approval before HS codes affect duty |

## Findings and accepted risks

- **F1 🟡 CSP allows inline scripts.** Next.js streams page data in inline `<script>` tags. Nonces would remove `'unsafe-inline'` but force every page to render per request, giving up Cache Components' static shells. The experimental SRI option doesn't apply in Turbopack builds (tested). Mitigated by F16 (no raw HTML anywhere) and React's output escaping. All other directives are strict. *Revisit if Next.js adds hash support for streamed scripts.*
- **F2 🟡 In-memory rate limits are per instance.** On serverless, set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (free tier) so limits are global.
- **F3 🟡 Service-role key on the server.** Used only for storage writes and signed URLs after an explicit role check, in `server-only` modules. Rotate it if it is ever exposed.
- **F4 🟡 MFA and leaked-password protection** are Supabase Auth dashboard settings, not code. Enable both for any real deployment.
- **F5 ℹ️ Payouts are simulated, Stripe is test-mode only.** `env.ts` rejects live keys at startup and the webhook rejects live-mode events.
- **F6 ℹ️ Duty rates are indicative** and labelled as such in the UI.

No high or medium findings remain open.
