# Paste this into Antigravity's Agent Manager (Planning mode)

---

You are building **NexusTrade**, an AI-assisted cross-border freight and settlement hub for UAE trade corridors. It is a portfolio project, so code quality, tests and documentation matter as much as features.

First read `AGENTS.md`, `docs/SPEC.md`, `docs/FREE_TOOLS.md` and everything in `.agent/rules/`. Treat them as the source of truth.

Then start **Phase 1 (Scaffold)** from `docs/SPEC.md` §8:
- Next.js 15 App Router with TypeScript in strict mode, Tailwind and shadcn/ui, set up in this folder
- A Zod-validated `src/env.ts` and a `.env.example`
- Drizzle ORM configured for Supabase Postgres, with `db:generate`, `db:migrate` and `db:seed` scripts
- Vitest and Playwright installed with one smoke test each
- A GitHub Actions CI workflow running lint, typecheck, tests and build
- Security headers in `next.config.ts`
- `docs/PROGRESS.md`

Show me your implementation plan as an Artifact before writing code. After Phase 1, run `/verify`, commit, and stop. For later phases I'll type `/build-phase`.

Constraints: free tiers only, and Stripe in test mode only. Never commit secrets. The app must run with no AI key by using `MockExtractionProvider`.
