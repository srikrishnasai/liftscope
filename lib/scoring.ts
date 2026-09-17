import type {
  CrawlSummary,
  EffortBreakdown,
  EstimateInput,
  ScoreDriver,
  SitemapSummary,
} from "./types.ts";
import { TARGET_LABELS } from "./types.ts";
import { isFrontendStack, stackAlignment, stackIsActionable } from "./detect-stack.ts";
import { formatCount } from "./format.ts";

export const RUBRIC_VERSION = "1.0";

export const RUBRIC = {
  version: RUBRIC_VERSION,
  name: "LiftScope Migration Complexity Rubric",
  description:
    "Deterministic 1–10 complexity score from inventory size, scale, custom work, form density, integration signals, and migration target.",
  weights: {
    pageCount: "0.3–2.5",
    languages: "0–1.5",
    sites: "0–1.6",
    customComponents: "0.2–1.8",
    formHeavy: "0–1.2",
    integrations: "0–1.5",
    target: "0.6–1.1",
  },
} as const;

const PAGE_BANDS: { max: number; points: number; label: string }[] = [
  { max: 50, points: 0.3, label: "brochure-scale inventory" },
  { max: 200, points: 0.8, label: "typical marketing site" },
  { max: 800, points: 1.4, label: "substantial content corpus" },
  { max: 2500, points: 2.0, label: "large-scale migration" },
  { max: Infinity, points: 2.5, label: "enterprise-scale inventory" },
];

function bandPoints(
  n: number,
  bands: { max: number; points: number; label: string }[],
): { points: number; label: string } {
  const band = bands.find((b) => n <= b.max) ?? bands[bands.length - 1];
  return { points: band.points, label: band.label };
}

export function scoreEstimate(
  input: EstimateInput,
  sitemap: SitemapSummary,
  crawl: CrawlSummary,
): { complexity: number; raw: number; drivers: ScoreDriver[] } {
  const drivers: ScoreDriver[] = [];

  const pageCountKnown = sitemap.urlCount > 0;
  const pageCount = pageCountKnown ? sitemap.urlCount : 200;
  const pageBand = bandPoints(pageCount, PAGE_BANDS);
  drivers.push({
    id: "page-count",
    label: "Page inventory",
    points: pageBand.points,
    detail: sitemap.urlCountOverridden
      ? `${formatCount(pageCount)} URLs (overridden) — ${pageBand.label}`
      : pageCountKnown
        ? sitemap.urlCountEstimated
          ? `~${formatCount(pageCount)} URLs extrapolated from ${sitemap.childSitemapsFetched} of ${sitemap.childSitemapsTotal} child sitemaps — ${pageBand.label}`
          : `${formatCount(pageCount)} URLs in sitemap — ${pageBand.label}`
        : sitemap.indexUnresolved
          ? `Sitemap index could not be resolved to pages; scored as 200 (${pageBand.label}). Point at a child sitemap to refine.`
          : `Page count unknown; scored as 200 (${pageBand.label}). Provide a sitemap to refine.`,
  });

  const langs = Math.max(1, input.languageCount);
  const langPoints =
    langs === 1 ? 0 : langs <= 3 ? 0.5 : langs <= 8 ? 1.0 : 1.5;
  drivers.push({
    id: "languages",
    label: "Languages / locales",
    points: langPoints,
    detail:
      langs === 1
        ? "Single locale — limited translation and URL mapping load"
        : `${langs} locales — live copies, translation workflow, and locale URL strategy`,
  });

  const sites = Math.max(1, input.siteCount);
  const sitePoints =
    sites === 1 ? 0 : sites <= 4 ? 0.5 : sites <= 10 ? 1.1 : 1.6;
  drivers.push({
    id: "sites",
    label: "Sites / brands",
    points: sitePoints,
    detail:
      sites === 1
        ? "Single site — one information architecture and launch window"
        : `${sites} sites — shared components, MSM/inheritance, and staggered cutovers`,
  });

  const components = Math.max(0, input.customComponentCount);
  const componentPoints =
    components <= 10
      ? 0.2
      : components <= 40
        ? 0.7
        : components <= 100
          ? 1.2
          : 1.8;
  drivers.push({
    id: "components",
    label: "Custom components",
    points: componentPoints,
    detail:
      components === 0
        ? "No custom components declared — out-of-the-box rebuild assumed"
        : `${components} custom components — mapping, parity testing, and design-system alignment`,
  });

  const formPct = crawl.formHeavyPct;
  const formPoints =
    formPct <= 5 ? 0 : formPct <= 15 ? 0.4 : formPct <= 30 ? 0.8 : 1.2;
  drivers.push({
    id: "forms",
    label: "Form-heavy pages",
    points: formPoints,
    detail: crawl.formHeavyOverridden
      ? `${formPct}% form-heavy (overridden)`
      : crawl.degraded
        ? "Form density inferred from limited samples — treat as directional"
        : `${formPct}% of sampled pages classified form-heavy`,
  });

  const uniqueSignals = crawl.signals;
  let integrationPoints = Math.min(1.5, uniqueSignals.length * 0.25);
  if (
    uniqueSignals.includes("sso") &&
    uniqueSignals.includes("personalization")
  ) {
    integrationPoints = Math.min(1.5, integrationPoints + 0.3);
  }
  drivers.push({
    id: "integrations",
    label: "Integration surface",
    points: Number(integrationPoints.toFixed(2)),
    detail:
      uniqueSignals.length === 0
        ? crawl.degraded
          ? "No integration signals visible — crawl was limited"
          : "No obvious analytics, SSO, form, or personalization hooks in samples"
        : `Detected${crawl.signalsOverridden ? " (overridden)" : ""}: ${uniqueSignals.join(", ")}`,
  });

  const targetPoints =
    input.target === "aemaacs-upgrade"
      ? 0.6
      : input.target === "other-to-aem"
        ? 1.0
        : 1.1;
  const targetWhy =
    input.target === "aemaacs-upgrade"
      ? "In-platform upgrade: Cloud Manager, immutable repo, and dispatcher constraints"
      : input.target === "other-to-aem"
        ? "Rebuild on AEM: component models, editable templates, and authoring UX"
        : "Leave AEM: content model remapping, component parity, and integration rewrite";
  drivers.push({
    id: "target",
    label: "Migration target",
    points: targetPoints,
    detail: `${TARGET_LABELS[input.target]} — ${targetWhy}`,
  });

  const stack = crawl.stack?.primary;
  const alignment = stackAlignment(stack?.id, input.target);
  const actionable = stackIsActionable(crawl.stack);
  const stackPoints = actionable && alignment === "mismatch" ? 0.5 : 0;
  drivers.push({
    id: "source-stack",
    label: "Detected source stack",
    points: stackPoints,
    detail: stack
      ? isFrontendStack(stack.id)
        ? `${stack.label} frontend — source CMS not identified; score unchanged`
        : !actionable
          ? `${stack.label} hinted at low confidence — not used in the score`
          : alignment === "mismatch"
            ? `HTML looks like ${stack.label}, which does not match ${TARGET_LABELS[input.target]}`
            : `${stack.label} — ${crawl.stack?.confidence ?? "low"} confidence from sampled pages`
      : crawl.degraded
        ? "Stack not identified — page sample was limited"
        : "No CMS fingerprint; treat source platform as unconfirmed",
  });

  const raw =
    1.0 + drivers.reduce((sum, driver) => sum + driver.points, 0);
  const complexity = Math.min(10, Math.max(1, Math.round(raw)));

  return {
    complexity,
    raw: Number(raw.toFixed(2)),
    drivers: drivers.sort((a, b) => b.points - a.points),
  };
}

/**
 * Effort model v0.2 — calibrated against ONE delivered migration.
 *
 * v0.1 blended everything into a single complexity curve and was **~8x low**
 * on a real AMS -> AEMaaCS programme (predicted 26 person-weeks, actual 212),
 * with `high` hard-capped at 120 so the tool could not express the project at
 * any input. The cap is gone and the curve is split three ways, because the
 * buckets are driven by different things:
 *
 *   code     - refactoring. Scales with complexity, or directly with BPA
 *              remediation points when a Best Practices Analyzer report
 *              was supplied.
 *   content  - migration itself (Content Transfer Tool runs, validation,
 *              top-ups, assets). Scales with **repositories and sites**, not
 *              with page count: CTT effort is cycles-per-repository, and each
 *              cycle needs babysitting and re-validation.
 *   overhead - environment/Cloud Manager setup, testing, cutover, hypercare,
 *              project management. Applied as an uplift on delivery work.
 *
 *   total = (code + content) * (1 + OVERHEAD)
 *
 * CALIBRATION PROVENANCE — read before changing any constant.
 * One project: AEM 6.5.21 on AMS, 7 repositories, ~10 sites, 4,761 BPA
 * findings, delivered by 7 people over 7 months (~212 person-weeks), split
 * roughly 30% code / 40% content / 30% everything else.
 *
 * What that grounds: the three-part structure, the ~0.43 overhead uplift, and
 * the totals for each bucket on an estate of that shape.
 *
 * What it does NOT ground: the split of `content` between the per-repository
 * and per-site terms (only their sum is observed), the locale term (that
 * project's locale count is unknown, so the term is zero at one locale by
 * construction), or whether a 40% content share generalises at all — that
 * estate had 7 repositories, which is a lot. A single-repository customer will
 * very likely sit lower.
 *
 * Do not tune these constants on a hunch. Add a second delivered project with
 * known actuals and re-fit.
 */

/**
 * Code refactoring, when no BPA report is available.
 *
 * Driven by **custom component count**, not by the complexity score. The
 * complexity rubric blends page inventory, form density and integration
 * signals — those are content and scope proxies, and a large estate can score
 * mid-range on it while carrying an enormous codebase. The calibration project
 * is exactly that case: 530 custom components and 7 repositories, but
 * complexity 5 when no sitemap is supplied.
 *
 * Size and complexity are different questions. Effort follows size.
 */
const CODE_BASE = 6;
const CODE_PER_COMPONENT = 0.11;
/** Person-weeks per BPA remediation point, when a BPA report was supplied. */
export const BPA_POINT_WEEKS = 0.33;
/** Content migration: CTT setup and cycles are per repository. */
const CONTENT_PER_REPO = 6;
/** Plus per-site validation, cutover and regression. */
const CONTENT_PER_SITE = 4.3;
/** Extra locales add language copies and translation QA. Zero at one locale. */
const CONTENT_PER_EXTRA_LOCALE = 2;
/** Env setup, testing, cutover, hypercare, PM, as an uplift on delivery work. */
const OVERHEAD = 0.43;

/**
 * Band spread. Deliberately wide: one calibration point gives a central
 * estimate and no error distribution at all, so a narrow band would be a
 * fabricated precision. Present this as a planning range, never as a bid.
 */
const BAND_LOW = 0.6;
const BAND_HIGH = 1.75;

export function effortFromScore(
  /**
   * Retained for the signature and for future use, but the code term no
   * longer reads it — see the CODE_BASE note. Size drives effort; complexity
   * describes difficulty. A big-but-straightforward estate is a lot of work
   * at a middling complexity score, and the two should not be conflated.
   */
  _score: number,
  input: EstimateInput,
): EffortBreakdown {
  const sites = Math.max(1, input.siteCount);
  const langs = Math.max(1, input.languageCount);
  const repos = Math.max(1, input.repoCount ?? 1);

  const components = Math.max(0, input.customComponentCount || 0);
  const fromBpa =
    typeof input.bpaPoints === "number" && Number.isFinite(input.bpaPoints);
  const code = fromBpa
    ? Math.max(0, input.bpaPoints as number) * BPA_POINT_WEEKS
    : CODE_BASE + components * CODE_PER_COMPONENT;

  const content =
    repos * CONTENT_PER_REPO +
    sites * CONTENT_PER_SITE +
    Math.max(0, langs - 1) * CONTENT_PER_EXTRA_LOCALE;

  const delivery = code + content;
  const overhead = delivery * OVERHEAD;
  const mid = delivery + overhead;

  const low = Math.round(mid * BAND_LOW);
  return {
    low: Math.max(3, low),
    mid: Math.max(low + 2, Math.round(mid)),
    high: Math.round(mid * BAND_HIGH),
    code: Number(code.toFixed(1)),
    content: Number(content.toFixed(1)),
    overhead: Number(overhead.toFixed(1)),
    fromBpa,
  };
}

