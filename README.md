# LiftScope

A CMS / AEM migration estimator. Paste a sitemap (or upload XML), declare the target and scale, and get a complexity score, effort bands, risk register, and phased plan.

**Get a credible AEM/CMS migration estimate in 10 minutes.**

Scoring is a deterministic TypeScript rubric — no LLM keys and no Stripe keys required. Storage runs off a local JSON file until you point it at Upstash Redis.

**Agents:** start at [`docs/FOR-AGENTS.md`](docs/FOR-AGENTS.md). What shipped, in order: [`CHANGELOG.md`](CHANGELOG.md).

## Run locally

```bash
npm install && npm run dev
```

The app listens on [http://127.0.0.1:43173](http://127.0.0.1:43173).

```bash
npm run build
npm start
```

Home, estimate, and report pages reserve **left and right ad rails** (160×600 skyscrapers) on wide viewports, plus a compact mobile banner when those rails collapse. They are placeholders — `data-ad-slot="left|right|mobile"` — and hide when printing a report.

## Routes

| Path | Purpose |
| --- | --- |
| `/` | Marketing landing |
| `/estimate` | Estimate form |
| `/estimate?demo=1` | Auto-runs the built-in Northline Financial fixture |
| `/login` | Sign in (required before paid unlock) |
| `/signup` | Create account |
| `/account` | Profile and account settings |
| `POST /api/auth/signup` | Create account + session cookie |
| `POST /api/auth/login` | Sign in |
| `POST /api/auth/logout` | Sign out |
| `GET /api/auth/me` | Current session |
| `POST /api/analyze` | Sitemap parse, page sample, scoring |
| `GET /api/reports/[id]` | Read a report still in process memory |
| `GET /api/reports/[id]/unlock` | Whether this process has a paid/demo unlock flag |
| `GET /api/memo` | Whether AI polish is configured |
| `POST /api/memo` | Template memo, or AI polish when a key is set |
| `POST /api/stripe/checkout` | Create a Checkout Session for a report |
| `GET /api/stripe/config` | Whether Stripe is configured and the unlock price |
| `GET /api/stripe/session` | Verify a paid Checkout Session and unlock |
| `POST /api/stripe/webhook` | `checkout.session.completed` |

Use **Try sample estimate** on the form if you do not have a public sitemap.

## How scoring works

Rubric v1.0 (`lib/scoring.ts`) maps these inputs to a 1–10 complexity score:

- Sitemap URL count (or an assumed 200 if none is available)
- Number of sites and languages
- Declared custom components
- Form-heavy share of sampled pages
- Integration smells in HTML (analytics, forms, SSO, personalization, commerce, search)
- Source CMS fingerprints from sampled HTML (AEM, WordPress, Drupal, Sitecore, Shopify, Webflow, headless, and others). A mismatch only adds a driver and a ranked risk when confidence is medium or high and the hit is a CMS, not a frontend framework. Loose brand-name matches are ignored.
- Migration target: AEMaaCS upgrade, AEM → other CMS, or other CMS → AEM

Effort is a **low / mid / high** person-week band derived from the score and scale — not a single-point bid.

On the report, **Adjust assumptions** recalculates the same rubric in the browser (page count, sites, languages, components, form-heavy %, integrations, target). A sensitivity line shows how complexity and the mid-case band move versus the original analysis.

**Tighten the band** (`lib/tighten.ts`) is the next step after the sitemap pass: five discovery questions plus optional scope flags (commerce/PIM, hard deadline, regulatory). Answers add drivers, can raise or lower complexity, may multiply the effort band, and inject ranked risks — still no AEM login or package scan.

Unlocked reports include a **client memo**. The default is a template generated from the report JSON (`lib/memo.ts`). Optional **Polish with AI** may rewrite prose only. Drafts that drop or change rubric numbers are discarded.

### Hugging Face (optional)

Create a token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) with Inference permission, then:

```
HF_TOKEN=hf_...
HF_MODEL=Qwen/Qwen2.5-7B-Instruct
```

LiftScope calls Hugging Face Inference Providers (`https://router.huggingface.co/v1`) with an OpenAI-compatible chat API. Swap `HF_MODEL` for a larger instruct model if small models fail the number-fidelity check (the template memo is shown instead).

OpenAI still works via `OPENAI_API_KEY`. A key starting with `hf_` is treated as Hugging Face unless `OPENAI_BASE_URL` is set.

Leave all of these unset for the template memo. Scoring never calls an LLM.

A homepage URL also works when you do not have a sitemap: if the URL returns HTML, LiftScope treats it as a page sample and still fingerprints the stack.

Page sampling is polite: user-agent `LiftScope/1.0`, 8s timeout, max 12 pages, concurrency 3. Sitemap indexes fetch the first 8 child sitemaps. Stack detection is heuristic (scripts, generator tags, asset paths, response headers) — not an authoring login.

## Environment

Copy `.env.example` if you want optional flags:

```
AUTH_SECRET=replace-with-a-long-random-string
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_UNIT_AMOUNT=4900
HF_TOKEN=
HF_MODEL=Qwen/Qwen2.5-7B-Instruct
```

### Storage

Reports, accounts, and paid unlocks go through one driver (`lib/kv.ts`):

- Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` and everything is durable across instances and cold starts. **Do this before taking real payments.**
- Leave them unset and it writes `data/store.json`, so local development needs no account anywhere. That file is gitignored, is single-writer, and on Vercel would land in `/tmp` and disappear — it is a development convenience, not a deployment option.

Reports expire after 30 days. An existing `data/accounts.json` from an earlier version is imported automatically on first read and renamed to `accounts.json.migrated`.

### Accounts

Estimates and the teaser stay public. **Paid unlock requires sign-in** (`/signup`, `/login`) so Checkout and the purchase attach to an account, not only `localStorage`. After login, **Account** (`/account`) covers display name, email, password, unlocked reports, sign out, and delete account. Passwords are hashed with bcrypt. Set `AUTH_SECRET` in production. This is not a full identity platform — no OAuth and no password-reset email yet.

### Stripe Checkout

Unlocking the rest of a live report (remaining risks, plan, memo, sampled pages) goes through Stripe-hosted Checkout. Default price is **$49 USD** (`STRIPE_UNIT_AMOUNT=4900`). Set `STRIPE_PRICE_ID` if you already have a Price in the Dashboard.

Without `STRIPE_SECRET_KEY`, the unlock button stays free so the product can be reviewed. The Northline sample fixture also stays free even when Stripe is on.

When Stripe is on, a live report asks you to **sign in first**, then Checkout. The session is created with `customer_email` and `metadata.userId`. Paid unlocks are recorded on that account.

Return URL is `/report/[id]?checkout=success&session_id={CHECKOUT_SESSION_ID}`. The app retrieves the session from Stripe and only unlocks if `payment_status=paid` and the session belongs to that report. Optional webhook: `POST /api/stripe/webhook` for `checkout.session.completed`.

```bash
stripe listen --forward-to localhost:43173/api/stripe/webhook
```

Test card: `4242 4242 4242 4242`, any future expiry, any CVC.

With Upstash configured, the unlock is recorded on the account and survives cold starts. The returning browser also stores unlock in `localStorage`; keep `session_id` on the success URL if you need to re-verify.

## Deploy

The app is a standard Next.js App Router project. Deploy on Vercel with `npm run build`.

Set `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `AUTH_SECRET`. Without the Upstash pair the app still runs, but storage falls back to a file under `/tmp` that is wiped on every recycle — reports 404 and paid unlocks are lost.

## Limitations

- No AEM CRX login or live package analysis
- CMS stack is inferred from public HTML, not a production authoring session
- Stripe Checkout is optional; without keys, unlock is local for review
- Paid unlocks require an account
- The local file store is single-writer and for development only; production needs Upstash
- Public sitemaps only; blocked hosts still produce a partial estimate from the form
- Shareable report URLs last 30 days with Upstash configured; without it, only within one process or the same browser
