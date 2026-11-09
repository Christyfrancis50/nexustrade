---
description: Run every NexusTrade quality gate
---

// turbo-all
1. `npm run lint`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. If the dev server and database are available, run `npx playwright test`.
6. Report each check as pass or fail. If anything fails, fix it and re-run the checks before reporting done.
