# NexusTrade — Product & Technical Spec

## 1. Problem
In UAE trade corridors, freight forwarders and importers lose time and money to three things:
1. slow manual processing of trade documents
2. invoices whose line items or taxes don't match
3. settlement that takes 30–60 days

NexusTrade ingests trade documents, reconciles costs and VAT, suggests customs HS codes with AI, and pays carriers in milestones from escrow.

## 2. Users and roles
| Role | Can do |
|---|---|
| Logistics coordinator | Create shipments, upload BoL/AWB/packing lists/invoices, update transit status, generate packing slips |
| Customs broker | Review and approve AI-suggested HS codes and duties, flag hazardous or restricted goods, mark customs cleared |
| Finance controller | Review invoices, release escrow milestones, download VAT audit reports, export CSV for Zoho Books / Xero |

## 3. Modules

### A. Document ingestion and AI extraction
- Drag-and-drop upload for PDF, PNG and JPEG files of up to 10 MB, stored in a private bucket.
- A vision model (Vercel AI SDK, `generateObject`) extracts data into a strict Zod schema:
  - shipper and consignee name and TRN (15-digit UAE TRN, validated)
  - document type, number and date, plus origin and destination ports (UN/LOCODE, e.g. `CNSHA`, `AEJEA`)
  - line items: description, quantity, unit, unit price, currency, weight in kg, volume in CBM
  - stated subtotal, VAT and total
- The app recomputes the totals and shows any **discrepancy flag** on the document review screen.
- `MockExtractionProvider` returns fixture data when no AI key is set.

### B. HS code classifier
- Seed `hs_codes` with at least 300 real 6-digit HS headings, each with a description and an indicative UAE/GCC duty rate (5% by default; 0% for exempt categories).
- Embed the descriptions (with any free embedding model, or a local one through transformers.js) into a `vector(384|1536)` column with an HNSW index.
- For each line item, return the top 3 matches with a cosine-similarity confidence, the duty % and the estimated duty in AED.
- The broker approves or overrides each code; the choice is recorded in `classification_decisions` for audit.

### C. Ledger and tax engine
- Chart of accounts: Escrow Holding, Accounts Receivable, Freight Revenue, VAT Payable, Customs Duty Payable, Carrier Payable, Cash (Stripe).
- `ledger_transactions` (header) has many `ledger_entries` (lines). Each transaction balances.
- FX: AED is the base currency, with USD/EUR/GBP rates from a free feed (e.g. frankfurter.app). The app caches rates in `fx_rates` and falls back to the last known rate.
- Tax engine: standard 5%, zero-rated export 0%, free-zone exempt. Every case is unit-tested.
- Idempotency: an `idempotency_keys` table stores the request hash and the response.

### D. Milestone escrow and payouts
| Milestone | Trigger | Ledger effect |
|---|---|---|
| Booking confirmed | Stripe test payment succeeded (webhook) | Lock 10% deposit: Dr Cash / Cr Escrow Holding |
| Customs cleared | Broker marks the shipment CLEARED | Release 40%: Dr Escrow Holding / Cr Carrier Payable |
| Proof of delivery signed | Coordinator uploads the signed PoD | Release the remaining 50% |
- Use Stripe test mode with signature-verified webhooks. Payouts are simulated with ledger entries plus a payout record.

### E. Role-based dashboards
- Coordinator: shipment table, status timeline, upload panel.
- Broker: HS review queue with confidence bars and restricted-goods flags.
- Finance: escrow balances, a freight-spend chart (Recharts), a VAT summary, and CSV exports.

## 4. Data model (Drizzle)
Start from these tables and extend them:
- `shipments` (tracking_number unique; shipper, consignee, origin and destination ports; status enum DRAFT | IN_TRANSIT | CUSTOMS_HOLD | CLEARED | DELIVERED)
- `invoices` (shipment_id, invoice_number unique, subtotal, vat_rate, vat_amount, total, currency, tax_treatment enum)
- `ledger_transactions`, `ledger_entries` (account, direction DEBIT/CREDIT, amount, currency, base_amount_aed, fx_rate, idempotency_key)
- `profiles` (user_id, role), `documents`, `line_items`, `hs_codes` (code, description, duty_rate, embedding), `classification_decisions`, `escrow_milestones`, `payouts`, `fx_rates`, `idempotency_keys`, `audit_log`

## 5. Non-functional requirements
- Lighthouse scores of 90 or more for Performance, Accessibility, Best Practices and SEO on the dashboard.
- Every money path is covered by unit tests. Playwright covers the full lifecycle.
- RLS is enabled on every table that holds user data.

## 6. Seed data
Seed a demo company, one user per role, 6 shipments across all statuses (e.g. Shanghai CNSHA → Jebel Ali AEJEA), sample documents, and ledger history.

## 7. Acceptance criteria
- `npm run dev` works against Supabase. `npm run db:migrate && npm run db:seed` loads the demo data.
- The demo walkthrough works end to end: upload an invoice → extraction (mock or real) → discrepancy flag → HS suggestions → broker approval → invoice with VAT → Stripe test payment → escrow releases → the ledger balances to zero across all transactions.
- `npm run lint`, `npm run typecheck`, `npm test` and `npx playwright test` all pass, and CI runs them.
- The README has an architecture diagram (Mermaid), setup steps, screenshots and the free-tools list.

## 8. Build phases
1. Scaffold: Next.js, TypeScript, Tailwind and shadcn; Zod `env.ts`; Drizzle and Supabase connection; CI workflow
2. Auth and roles: Supabase Auth, profiles, RLS policies, role-gated layouts
3. Schema and seed: all tables, migrations, the append-only ledger trigger, seed script
4. Ledger, tax and FX engine, with unit tests and idempotency
5. Module A: upload, storage, extraction provider, review UI, discrepancy check
6. Module B: HS embeddings, similarity search, broker review queue
7. Module D: Stripe test checkout, webhooks, milestone releases
8. Module E: dashboards, charts, CSV and VAT exports
9. Hardening: headers and CSP, rate limits, Playwright end-to-end tests, Lighthouse pass, README and Dockerfile
