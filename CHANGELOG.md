# Changelog

Shipped slices of LiftScope, newest first. For current invariants and file map, read `docs/FOR-AGENTS.md`.

## Unreleased

### Durable storage — paid unlocks survive

Reports lived in a per-process `Map`; accounts and paid unlocks lived in `data/accounts.json`, which on Vercel is under `/tmp`. Both vanish on a cold start or a second instance, so a user could pay through Stripe and land on *"Report is not in server memory"* — with no record on the account that they had bought anything.

All persistence now goes through a driver (`lib/kv.ts`) with two adapters:

- **Upstash Redis** when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set. REST-based, so there is no connection pool to exhaust on serverless. **Required in production.**
- **Local JSON file** under `data/` otherwise, so `npm install && npm run dev` still needs no credentials.

Key layout: `report:<id>` (30-day TTL), `reportunlock:<id>`, `user:<email>`, `userid:<id>`, `unlock:<userId>:<reportId>`, `unlocks:<userId>`.

An existing `data/accounts.json` is imported on first read and renamed to `accounts.json.migrated` rather than deleted. Verified live: a legacy account logs in with its original password and its paid unlock is intact.

`/data/` is now gitignored in full — previously only `accounts.json` was, and the new store file would have been committed with bcrypt hashes in it.

**Three latent bugs found while migrating**, none of which `tsc` reports:

- `recordUnlock` was not awaited in **either** Stripe path (`/api/stripe/session` and the webhook). Once storage became async, the invocation could end before the paid-unlock write landed — losing the exact record this work exists to protect.
- `if (!findAccountById(session.id))` in `/api/auth/password` is always false against a Promise, silently disabling the account check.
- The legacy-import guard set its "done" flag before the async work finished, so two concurrent requests could read a half-migrated store. It now memoizes the promise.

Type-aware ESLint rules (`no-floating-promises`, `no-misused-promises`, `await-thenable`) are enabled for `app/` and `lib/` to catch this class permanently — confirmed by reintroducing the bug and watching the rule fire.

Regression: `npm run test:store` (46 fixtures), whose load-bearing assertions are the cold-start ones. Verified live by killing the server mid-session: report, account, and login all survive.

### Sitemap indexes no longer wreck the inventory count

A sitemap **index** lists other sitemaps, not pages. When its children could not be read, `resolveSitemap` fell back to returning the index's own `<loc>` values — the child *sitemap* URLs. Those became the page inventory **and** the page sample, so:

- gov.uk (35 child sitemaps, ~875,000 URLs) scored as a **35-page brochure site**: complexity 4, mid-case 13 person-weeks
- the 12 "sampled pages" were XML files, so template mix, form density, and the CMS fingerprint all ran against sitemap XML instead of HTML

Now: index `<loc>` values are never pages. An index that cannot be resolved reports `urlCount: 0` (unknown → scored as ~200) with an `indexUnresolved` flag and a note explaining what to supply instead. gov.uk scores **complexity 7, mid-case 20 person-weeks**, sampling real pages.

Supporting fixes:

- **Child sitemaps were unreadable.** The 2MB cap rejected every real one (gov.uk's are ~5.6MB / 25,000 URLs each). Raised to 12MB — about 50,000 URLs, the sitemap spec's per-file limit.
- **Count and sample are now separate.** `urlCount` is the true inventory; `urls` stays capped at 4,000 for sampling. Previously a 50,000-URL site reported 4,000.
- **Partial reads are extrapolated, and labelled.** Reading 8 of 35 children reports `~875,000` with `urlCountEstimated`, surfaced in the score driver and the assumptions. Generators chunk uniformly, so this is sound — but it is never presented as a counted figure.
- **Children are fetched 3-up** instead of serially, so 8 children fit the 60s budget at the larger size (gov.uk: 3.5s end to end).
- Documents are scanned linearly instead of parsed into a tree — a 12MB child would otherwise build a large object graph just to be counted. `fast-xml-parser` is now unused.

Reading logic is split into `lib/sitemap-parse.ts` (pure) so it can be tested. Regression: `npm run test:sitemap` (32 fixtures, no network), covering index-vs-urlset detection, namespaced roots, CDATA and entity decoding, count-past-sample-cap, extrapolation arithmetic, and the specific "no .xml in the page sample" assertion.

### Number formatting pinned to en-US

`toLocaleString()` follows the *server's* locale, so the same report rendered on an en-IN host read `8,75,000` instead of `875,000` — and a server/client locale split risks a hydration mismatch. All call sites now use `formatCount` (`lib/format.ts`), matching the existing `formatDate` convention.

### Outbound fetch guard (SSRF)

Every caller-supplied URL now goes through `safeFetch` (`lib/net-guard.ts`): http/https only, no embedded credentials, ports 80/443 only, and the hostname must resolve entirely to public unicast addresses. Loopback, RFC1918, CGNAT, link-local (including the `169.254.169.254` cloud metadata endpoint), IPv4-mapped and NAT64-wrapped forms, and reserved ranges are refused.

Redirects are followed **manually** so every hop is re-checked — previously `redirect: "follow"` meant a public host could 302 into the metadata endpoint. Confirmed against a live redirector: hop 1 resolves, hop 2 is refused.

This covers the child-sitemap path too: `resolveSitemap` fetches `<loc>` values out of a sitemap index it just downloaded, so those URLs are attacker-controlled whenever the sitemap is.

Response bodies are capped while streaming rather than after buffering. Sitemaps error past the cap (truncated XML will not parse); pages truncate and keep what arrived. `gunzipSync` has a `maxOutputLength` so a small `.gz` cannot expand into a memory bomb.

`LIFTSCOPE_ALLOW_PRIVATE_HOSTS=1` disables host checks for local testing. Off by default.

Regression: `npm run test:net` (58 fixtures, no network).

### Rate limiting

In-memory fixed-window limiter (`lib/rate-limit.ts`) keyed by forwarded IP, with `RateLimit-*` and `Retry-After` headers on 429:

| Endpoint | Limit |
| --- | --- |
| `POST /api/analyze` (live crawl) | 8 / 10 min |
| `POST /api/analyze` (demo, no network) | 40 / 10 min |
| `POST /api/memo` (AI polish) | 6 / 10 min |
| `POST /api/memo` (template) | 60 / 10 min |
| `POST /api/auth/login` | 10 / 15 min |
| `POST /api/auth/signup` | 5 / hour |

Per-process, so it resets on cold start and does not coordinate across serverless instances — abuse friction, not a quota. Move it with the reports/accounts store.

### Sign-in no longer reveals which emails exist

`/api/auth/login` ran bcrypt only when the account existed, so response latency answered "is this email registered?". Unknown emails now run `burnPasswordCompare` against a decoy hash at the same cost factor. Measured gap fell to ~13ms against ~100ms of bcrypt work.

## 2026-09-16

### Agent orientation docs

`docs/FOR-AGENTS.md` is the landing page for other models: invariants, file map, product loop, types, env, checks, and known pitfalls. `CHANGELOG.md` lists shipped slices newest-first. README points at both. Do not write product notes in root `AGENTS.md` (`next dev` regenerates it).

### Account profile and settings

After login, **Account** in the header opens `/account`. Display name, email (password required), password change, list of paid unlocks, sign out, delete account. Anonymous `/account` redirects to `/login?next=/account`.

### Login before paid unlock

Estimates and the two-risk teaser stay public. Stripe Checkout and paid unlock require a session. Checkout sends `customer_email` and `metadata.userId`. Unlocks are stored on the account in `data/accounts.json`. Sample fixture remains free.

### Stripe Checkout

Live full-report unlock goes through Stripe-hosted Checkout (default **$49 USD**, `STRIPE_UNIT_AMOUNT=4900`). Success URL verifies `payment_status=paid` and report id. Optional webhook `POST /api/stripe/webhook`. Without `STRIPE_SECRET_KEY`, unlock stays free for local review.

### Ad rail placeholders

Left/right **160×600** skyscrapers on `xl+` viewports; compact mobile banner under the header otherwise. `data-ad-slot` only — no network. Hidden when printing.

### Source CMS fingerprints

Dropped sitemap **or homepage** HTML is fingerprinted (AEM, WordPress, Drupal, Sitecore, Shopify, Webflow, headless, …). Report shows a **Detected source stack** card on the teaser.

False positives (Airbnb as Contentful via `LargestContentfulPaint`, Salesforce as WordPress from one `og:image`, HubSpot/Webflow from marketing copy) were tightened. Only **medium+ CMS** hits move complexity or inject `stack-mismatch`. Frontends (Next.js/Nuxt) display as hints and do not change the score. Regression: `npm run test:stack`.

### Hugging Face memo polish

Optional client-memo rewrite via Hugging Face Inference Providers (`HF_TOKEN`, `HF_MODEL`). OpenAI-compatible fallback. Scoring never calls a model. Polish that drops rubric numbers is discarded.

### Client memo

Unlocked reports include a one-page memo generated from the report JSON (`lib/memo.ts`). Optional AI polish rephrases only.

### Tighten the band

Post-crawl questionnaire (components, forms, identity, personalization, locales) plus optional commerce/deadline/regulatory flags. Adds drivers, may stretch effort, injects ranked risks — still no AEM login.

### Assumption overrides

On the report, change page count, sites, locales, components, form-heavy %, integrations, or target. Same rubric recomputes in the browser. Sensitivity line vs original analysis.

### MVP estimator

Sitemap parse (urlset / index, gzip), polite page sample (max 12, 8s, concurrency 3), deterministic rubric v1.0, effort bands, risk register, phased plan, Northline demo fixture, in-memory + `localStorage` reports. Freemium: score + two risks visible; remainder behind unlock.
