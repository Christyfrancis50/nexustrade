# Free tools for security, speed and optimisation

Everything below has a free tier or is open source. Use ✅ items by default; ➕ items are optional extras.

## Hosting and infrastructure
| Tool | Use | Free tier |
|---|---|---|
| ✅ Vercel (Hobby) | Next.js hosting, edge CDN, preview deploys | Personal, non-commercial projects |
| ✅ Supabase | Postgres, pgvector, Auth, Storage, RLS | 2 projects, 500 MB DB, 1 GB storage |
| ➕ Neon | Alternative serverless Postgres with pgvector | 0.5 GB |
| ➕ Cloudflare | DNS, CDN, WAF, DDoS protection, Turnstile (a free CAPTCHA alternative) | Generous free plan |

## Security
| Tool | Use |
|---|---|
| ✅ Supabase Auth + Postgres RLS | Sign-in and row-level access by role |
| ✅ Zod | Validate every input, AI output and env var |
| ✅ Upstash Redis + `@upstash/ratelimit` | Rate limiting (10k commands/day free) |
| ✅ Security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy) | Set in `next.config.ts`; check with securityheaders.com and Mozilla Observatory |
| ✅ GitHub Dependabot | Automatic dependency update PRs |
| ✅ GitHub CodeQL | Static security analysis (free for public repos) |
| ✅ GitHub secret scanning + push protection | Blocks leaked keys |
| ✅ `npm audit` / OSV-Scanner | Vulnerability checks in CI |
| ✅ Stripe webhook signatures + idempotency keys | Payment integrity |
| ➕ Cloudflare Turnstile | Bot protection on sign-up and sign-in |
| ➕ Semgrep (community rules) | Extra static analysis |
| ➕ OWASP ZAP baseline scan | Automated scan of the deployed preview |
| ➕ Arcjet (free tier) | Bot detection, shield and rate limits as middleware |

## Speed and optimisation
| Tool / technique | Use |
|---|---|
| ✅ React Server Components + streaming (`loading.tsx`, Suspense) | Less client JS, faster first paint |
| ✅ `next/image`, `next/font` | Image optimisation, no layout shift |
| ✅ `next/dynamic` | Lazy-load Recharts and the PDF viewer |
| ✅ `unstable_cache` / `revalidateTag` | Cache FX rates and HS lookups |
| ✅ HNSW index on pgvector + Postgres indexes on foreign keys | Fast semantic search and joins |
| ✅ `@next/bundle-analyzer` | Find heavy dependencies |
| ✅ Lighthouse CI (GitHub Action) | Enforce a score of 90 or more on each PR |
| ✅ Vercel Speed Insights + Web Analytics | Real-user Core Web Vitals (free on Hobby) |
| ➕ PageSpeed Insights | Quick manual audits |

## Observability and quality
| Tool | Use |
|---|---|
| ✅ Sentry (Developer plan) | Errors and performance tracing |
| ✅ GitHub Actions | CI for lint, typecheck, tests, build and Playwright (free minutes for public repos) |
| ✅ Vitest + Playwright | Unit and end-to-end tests |
| ➕ Better Stack / UptimeRobot | Free uptime monitoring and a status page |
| ➕ Codecov | Coverage badges for the README |

## AI (free or low-cost)
| Tool | Use |
|---|---|
| ✅ `MockExtractionProvider` | Runs without any key, good for demos and CI |
| ➕ Google AI Studio (Gemini) free tier | Vision extraction through the Vercel AI SDK Google provider |
| ➕ transformers.js (`all-MiniLM-L6-v2`, 384-dim) | Free local embeddings for HS codes, no API needed |
| ➕ frankfurter.app | Free FX rates, no key required |
