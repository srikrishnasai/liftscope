# For agents

Read this before changing LiftScope. Human-facing run instructions stay in `README.md`. History of what shipped is in `CHANGELOG.md`.

Do **not** put product notes in root `AGENTS.md` / `CLAUDE.md` — `next dev` regenerates those.

## What this is

LiftScope is a **CMS / AEM migration estimator**. A sitemap (or homepage URL) plus scale fields produces:

- Complexity **1–10** from a published TypeScript rubric
- Low / mid / high **person-week** bands
- Ranked **risks**, **phased plan**, **client memo**
- Optional **source CMS fingerprint** (WordPress, Drupal, AEM, …)

It is a scoping aid, not a bid and not a live AEM package analyzer.

Stack: Next.js 16 App Router (TypeScript), Tailwind 4, shadcn/ui. Dev: `npm run dev` → `http://127.0.0.1:43173`. No DB. No LLM keys required.

## Invariants (do not break)

1. **The rubric owns the number.** Scoring is deterministic in `lib/scoring.ts`. Never call an LLM (or Hugging Face) to produce complexity, effort, or risks.
2. **AI is rewrite-only.** Optional memo polish (`lib/ai-memo.ts`) may rephrase prose. Drafts that drop or change rubric numbers are discarded (`memoKeepsNumbers`).
3. **Stack detection must not invent metrics.** Fingerprints live in `lib/detect-stack.ts`. A mismatch driver (+0.5) and the `stack-mismatch` risk apply only when `stackIsActionable()` is true: confidence **medium or high** and the hit is a **CMS**, not Next.js/Nuxt. Loose brand-name / LCP / CSS `:focus` matches were already a production bug — do not reintroduce them. `npm run test:stack` is the regression check.
4. **No second component library.** Use existing shadcn/ui primitives.
5. **All persistence goes through `lib/kv.ts`.** Upstash Redis when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set, otherwise a local JSON file under `data/`. Never reintroduce a module-level `Map` or a bespoke file for state that must outlive a request — that is what lost paid unlocks. Adding a *second* datastore still needs an explicit ask. `npm run test:store` is the regression check.
6. **Freemium gate:** score, bands, overrides, tighten-the-band, and **two** risks are public. Remaining risks, plan, memo, sampled pages, print — behind unlock.
7. **Paid path:** live report + `STRIPE_SECRET_KEY` → **sign in first**, then Stripe Checkout (~$49, `STRIPE_UNIT_AMOUNT=4900`). Sample fixture (`input.demo`) and instances without Stripe keys stay free to unlock.
8. **Ads are placeholders only** (`data-ad-slot=left|right|mobile`). Hide on print. No ad network is wired.
9. **Keep `userHasUnlock` exported** from `lib/accounts.ts`. Unlock APIs import it; dropping it breaks `/account` and paid reports.
10. **All outbound fetches go through `safeFetch`** (`lib/net-guard.ts`). Never call bare `fetch()` on a caller-supplied URL, and never set `redirect: "follow"` on one — every hop is re-validated because a 302 to `169.254.169.254` is otherwise a live SSRF. `npm run test:net` is the regression check.
11. **Public endpoints are rate limited** (`lib/rate-limit.ts`). New routes that crawl, hash a password, or spend model tokens take a bucket before doing the work.
12. **A sitemap index lists sitemaps, not pages.** Its `<loc>` values must never become `urlCount` or reach the page sample. An index we cannot resolve reports `urlCount: 0` (unknown → scored as ~200) plus `indexUnresolved`, never a page count. `npm run test:sitemap` is the regression check.
13. **Count and sample are separate.** `sitemap.urlCount` is the true inventory; `urls` is capped at `MAX_URLS` for sampling only. Never report `urls.length` as the inventory.
14. **Format numbers with `formatCount`** (`lib/format.ts`), never bare `toLocaleString()` — that follows the *server's* locale, so an en-IN host renders `8,75,000` and client/server can disagree during hydration.

## Product loop

1. `POST /api/analyze` parses sitemap (or treats HTML homepage as a page sample), fetches ≤12 pages (8s timeout, concurrency 3, UA `LiftScope/1.0`), classifies templates/integrations/stack, scores, stores report in memory.
2. Client saves a copy in `localStorage` and opens `/report/[id]`.
3. Overrides and tighten answers re-run `assembleReport` in the browser — no re-crawl.
4. Unlock: free if no Stripe / demo fixture; else login then Checkout. Paid unlocks recorded per `userId` through `lib/accounts.ts`.

## Where to edit

| Concern | Path |
| --- | --- |
| Types | `lib/types.ts` |
| Rubric, effort bands | `lib/scoring.ts` |
| Risks | `lib/risks.ts` |
| Plan / narrative / assumptions | `lib/plan.ts`, `lib/narrative.ts` |
| Assemble report | `lib/assemble.ts` |
| Sitemap fetch + child resolution | `lib/sitemap.ts` |
| Sitemap document reading (pure) | `lib/sitemap-parse.ts` |
| Sitemap fixtures | `lib/sitemap-fixtures.ts` (`npm run test:sitemap`) |
| HTML sample + analysis | `lib/fetch-pages.ts`, `lib/analyze.ts` |
| Outbound fetch guard (SSRF) | `lib/net-guard.ts` |
| Rate limiting | `lib/rate-limit.ts` |
| Guard + limiter fixtures | `lib/net-guard-fixtures.ts` (`npm run test:net`) |
| CMS fingerprints | `lib/detect-stack.ts` |
| Stack regression fixtures | `lib/detect-stack-fixtures.ts` (`npm run test:stack`) |
| Assumption overrides (client recompute) | `lib/overrides.ts` |
| Tighten-the-band questionnaire | `lib/tighten.ts` |
| Client memo template | `lib/memo.ts` |
| Optional AI polish | `lib/ai-config.ts`, `lib/ai-memo.ts`, `app/api/memo/route.ts` |
| Demo fixture | `lib/demo-fixture.ts` |
| Auth cookies | `lib/auth.ts` |
| Storage driver (Upstash / file) | `lib/kv.ts` |
| Reports + unlock flags | `lib/store.ts` |
| Users + paid unlocks | `lib/accounts.ts` |
| Storage fixtures | `lib/store-fixtures.ts` (`npm run test:store`) |
| Stripe | `lib/stripe.ts`, `app/api/stripe/*` |
| Report UI | `components/report-view.tsx`, `unlock-panel.tsx` |
| Estimate form | `components/estimate-form.tsx` |
| Profile | `app/account/page.tsx`, `components/account-settings.tsx` |
| Layout / ads | `components/site-shell.tsx`, `ad-slot.tsx` |

## Types (start here)

`EstimateInput` → crawl → `assembleReport` → `EstimateReport`.

- Targets: `aemaacs-upgrade` | `aem-to-other` | `other-to-aem`
- Page classes: `landing` | `article` | `product` | `form-heavy` | `other`
- Integration signals: `analytics` | `forms` | `sso` | `personalization` | `commerce` | `search`
- Stack ids include CMS (`aem`, `wordpress`, `drupal`, …) and frontends (`nextjs`, `nuxt`). Set `StackEvidence.kind` as `"cms" | "frontend"` (`as const`), never `string`.
- `stackIsActionable(stack)` gates scoring and the `stack-mismatch` risk.

## Auth (minimal)

Email + password, httpOnly cookie `liftscope_session`. Pages: `/login`, `/signup`, `/account`. APIs: `app/api/auth/{signup,login,logout,me,profile,email,password,account}`. Production requires `AUTH_SECRET`. No OAuth, no password-reset email. Anonymous `/account` redirects to `/login?next=/account`.

Unlock CTAs that need login must be `Link` + `buttonVariants` — do not nest `<Button>` inside `<Link>` (invalid HTML, breaks click).

## Env

Copy `.env.example`. All optional locally:

- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — **required in production.** Without both, storage falls back to a local file, which on Vercel is `/tmp` and is lost on every recycle.
- `AUTH_SECRET` — required in production; local fallback exists
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `STRIPE_UNIT_AMOUNT`, `STRIPE_CURRENCY`
- `HF_TOKEN` / `HF_MODEL` (preferred memo polish) or `OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_BASE_URL`

Never block scoring on missing keys.

## Checks

```bash
npm run test:stack   # fingerprint false-positive fixtures
npm run test:net     # SSRF guard, body caps, rate limiter
npm run test:sitemap # index vs urlset, counts, extrapolation
npm run test:store   # durability across cold starts, legacy migration
npm run build        # typecheck + Next production build
npm run lint
```

Fixture files are run with `node --experimental-strip-types`. Do not import them from app code (they are excluded from the Next tsconfig).

That runner does **not** do extensionless resolution, so anything a fixture imports must use an explicit `.ts` specifier and its transitive value imports must too. This is why `sitemap-parse.ts` is split from `sitemap.ts` (which pulls in `node:zlib` and the fetch chain) and imports `./urls.ts` by extension. `allowImportingTsExtensions` is enabled in tsconfig for this reason.

`npm run lint` currently reports 5 pre-existing problems: 3 `react-hooks/set-state-in-effect` errors in `report-client.tsx` / `unlock-panel.tsx`, plus unused-variable warnings in `api/auth/email/route.ts` and `api/memo/route.ts`. Do not treat a clean lint run as the baseline until those are fixed.

## Known pitfalls (already fixed — do not regress)

- Sitemap gzip: check magic bytes; do not double-decode.
- Demo fixture score must not always max at 10; retune drivers, do not cap arbitrarily in the UI.
- Fingerprint false positives: Airbnb `LargestContentfulPaint` ≠ Contentful; `cq:` in CSS `:focus` ≠ AEM; Salesforce `og:image` `/wp-content` ≠ WordPress; HubSpot/Webflow brand copy in marketing HTML ≠ those CMS.
- Inserting `stack-mismatch` in `lib/risks.ts` must not drop the `cloud-constraints` risk.
- `app/api/stripe/checkout` must not mark the report unlocked before payment.
- `create-next-app` cannot target `/workspace` directly (parent-writable false positive). Scaffold into a subdir if you ever re-init.
- Page fetches **truncate** at the byte cap; sitemap fetches **error**. A truncated XML document cannot be parsed, but classification only reads the head of an HTML page — erroring on large pages silently dropped real sites (gov.uk lost 11 of 12 samples). `onOverflow` in `safeFetch` picks the mode.
- Do not pipe `npm run dev` into `head`/`tail` when driving the app. The pipe closes, the dev server wedges on its next write, and every route hangs — it looks like an app bug.
- Storage calls are **async**. `tsc` will not catch a dropped `await`: `if (!findAccountById(id))` is always false against a Promise, and an un-awaited `recordUnlock` can lose a paid unlock when the invocation ends. Type-aware ESLint rules (`no-floating-promises`, `no-misused-promises`, `await-thenable`) are enabled in `eslint.config.mjs` for `app/` and `lib/` and are the only thing that catches this — do not disable them.
- Fixtures cannot use TypeScript parameter properties (`constructor(private x: T)`). The strip-only runner rejects them.

## Known gaps (not yet fixed)

- **Child sitemap counts are extrapolated, not counted.** Only `MAX_CHILD_SITEMAPS` (8) children are read; the inventory is scaled to the full index and flagged `urlCountEstimated`. Sound when a generator chunks uniformly (the normal case), wrong for a hand-written index with wildly uneven children.
- **Nested sitemap indexes are not followed.** A child that is itself an index is skipped rather than recursed.
- **Uploaded XML is still capped at 2MB** (`lib/validate.ts`) while fetched sitemaps allow 12MB. Raising it past ~4MB needs a platform that accepts the request body (Vercel caps around 4.5MB).
- **`fast-xml-parser` is now an unused dependency.** Sitemaps are scanned linearly instead of parsed into a tree. Safe to drop from `package.json`.
- **`/api/memo` trusts a caller-supplied report body.** It generates (and optionally AI-polishes) a memo for any JSON posted to it. Rate limited, not authenticated — the real fix is server-side unlock gating.
- **The file driver is single-writer.** It caches the whole store in memory and rewrites the file on every set, so two processes sharing a `data/` directory will clobber each other. Fine for `npm run dev`; it is why production needs Upstash.
- **Reports expire after 30 days** (`REPORT_TTL_SECONDS`). A paid unlock row outlives its report, so `/api/auth/me` reports `available: false` for an expired one rather than pretending it is still there.
- **`updateEmail` is not atomic.** It writes the new key before deleting the old, so an interrupted call leaves a duplicate record rather than an unreachable account. Deliberate: reachable beats orphaned.

## What is intentionally unfinished

- Paywall is UI + Stripe session verify; full report JSON is still sent to the client so overrides can run.
- No CRX/package scan, no real ad tags, no always-on deep crawl.

## When adding a feature

Match existing copy tone (agency scoping, not lorem). Cover empty/error states. Verify UI in the browser if you change layout. Prefer official Next/shadcn patterns. Update **this file** and `CHANGELOG.md` in the same commit as the behavior change.
