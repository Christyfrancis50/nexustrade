---
description: Build the next NexusTrade phase from docs/SPEC.md §8
---

1. Read `AGENTS.md`, `docs/SPEC.md` and `.agent/rules/engineering.md`. Check `docs/PROGRESS.md` to find the next unfinished phase (create the file if it is missing).
2. Write a short implementation plan for that phase only, as an Artifact, and wait for my approval.
3. Implement the phase. Keep money logic in pure functions with unit tests.
4. Run `/verify` and fix any failures.
5. Update `docs/PROGRESS.md` with what was done, any decisions made, and what comes next.
6. Commit with a conventional message, e.g. `feat(ledger): append-only double-entry engine`.
7. Stop and summarise. Do not start the next phase until I say so.
