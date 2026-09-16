import type {
  CrawlSummary,
  EffortBand,
  EstimateInput,
  ScoreDriver,
  SitemapSummary,
} from "./types";
import { TARGET_LABELS } from "./types";
import { isFrontendStack, stackAlignment, stackIsActionable } from "./detect-stack";
import { formatCount } from "./format";

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

export function effortFromScore(
  score: number,
  input: EstimateInput,
): EffortBand {
  const sites = Math.max(1, input.siteCount);
  const langs = Math.max(1, input.languageCount);
  const scale =
    1 + Math.max(0, sites - 1) * 0.12 + Math.max(0, langs - 1) * 0.08;
  const low = Math.round((2 + score * 1.4) * scale);
  const mid = Math.round((3.5 + score * 2.3) * scale);
  const high = Math.min(120, Math.round((5.5 + score * 3.5) * scale));
  return { low: Math.max(3, low), mid: Math.max(low + 2, mid), high };
}
