<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# NexusTrade — Agent Guide

AI-assisted cross-border freight and settlement hub for UAE trade corridors (JAFZA, Dubai South, Khalifa Port). It links logistics events (bookings, customs clearance, proof of delivery) to money workflows (multi-currency escrow, carrier payouts, customs duty, VAT-compliant invoicing).

Read these before writing code:
- `docs/SPEC.md`: product spec, modules A–E, data model, acceptance criteria
- `docs/FREE_TOOLS.md`: approved free tools for security, speed and observability
- `.agent/rules/`: always-on engineering rules
- `.agent/workflows/`: `/build-phase`, `/verify`, `/security-check`

Build in the phases listed in `docs/SPEC.md` §8, one phase at a time. Finish each phase with `/verify` (all checks green) and a commit before starting the next.

Keep the Next.js block above this section; `next dev` re-adds it if removed.
