---
description: Audit NexusTrade against its security rules
---

1. Run `npm audit --omit=dev` and list any high or critical issues.
2. Grep for secrets committed in the repo, `any` types, `parseFloat` or `Number()` used on money values, and Server Actions without Zod validation or a role check.
3. Confirm RLS is enabled on every table (query `pg_tables` together with `pg_policies`).
4. Confirm `ledger_entries` rejects UPDATE and DELETE.
5. Confirm the Stripe webhook verifies signatures and is idempotent.
6. Confirm the security headers and CSP are present (`curl -I` against the dev server).
7. Confirm the auth, upload and AI routes are rate-limited.
8. Write the findings to `docs/SECURITY_REVIEW.md` with a severity for each, then fix anything high or critical.
