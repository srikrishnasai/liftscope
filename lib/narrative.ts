import { isFrontendStack } from "./detect-stack";
import { formatCount } from "./format";
import type {
  CrawlSummary,
  EffortBand,
  EstimateInput,
  ScoreDriver,
  SitemapSummary,
} from "./types";
import { TARGET_LABELS } from "./types";

function bandLabel(score: number): string {
  if (score <= 3) return "contained";
  if (score <= 5) return "moderate";
  if (score <= 7) return "substantial";
  return "enterprise-grade";
}

export function buildNarrative(
  input: EstimateInput,
  sitemap: SitemapSummary,
  crawl: CrawlSummary,
  complexity: number,
  drivers: ScoreDriver[],
  effort: EffortBand,
): string {
  const top = drivers[0];
  const inventory = sitemap.urlCount
    ? `${formatCount(sitemap.urlCount)} inventoried URLs`
    : "an unverified page inventory";
  const sample =
    crawl.succeeded > 0
      ? ` Sampling found ${crawl.formHeavyPct}% form-heavy pages` +
        (crawl.signals.length
          ? ` and integration hints for ${crawl.signals.join(", ")}.`
          : ".")
      : " Page sampling was limited, so integration load is inferred from the brief.";
  const stackLine = crawl.stack?.primary
    ? isFrontendStack(crawl.stack.primary.id)
      ? ` Delivery looks like ${crawl.stack.primary.label}; the source CMS was not identified from HTML.`
      : ` Detected source stack: ${crawl.stack.primary.label} (${crawl.stack.confidence} confidence).`
    : crawl.succeeded > 0
      ? " Source CMS was not identified from HTML fingerprints."
      : "";

  return [
    `This ${TARGET_LABELS[input.target]} looks ${bandLabel(complexity)} (complexity ${complexity}/10) across ${input.siteCount} site${input.siteCount === 1 ? "" : "s"}, ${input.languageCount} locale${input.languageCount === 1 ? "" : "s"}, and ${input.customComponentCount} custom components, with ${inventory}.`,
    sample,
    stackLine,
    top
      ? ` The strongest driver is ${top.label.toLowerCase()}: ${top.detail}.`
      : "",
    ` Treat ${effort.low}–${effort.high} person-weeks as a planning band, not a bid — mid-case is about ${effort.mid} person-weeks if the assumptions below hold.`,
  ].join("");
}

export function buildAssumptions(
  input: EstimateInput,
  sitemap: SitemapSummary,
  crawl: CrawlSummary,
): string[] {
  const assumptions = [
    "One experienced AEM/CMS pod (PM, tech lead, 2–3 developers, 1 content/QA) unless scale implies parallel streams.",
    "Design system and brand tokens already exist; this estimate is implementation and content, not a rebrand.",
    "No legal hold, WCAG lawsuit remediation, or full accessibility rebuild is included.",
    `${input.customComponentCount} custom components is taken as given — unused or deprecated components are not subtracted.`,
  ];

  if (sitemap.urlCount === 0) {
    assumptions.push(
      sitemap.indexUnresolved
        ? "Page inventory assumed at ~200 URLs: the sitemap was an index of other sitemaps and none could be read."
        : "Page inventory assumed at ~200 URLs because no usable sitemap was parsed.",
    );
  } else if (sitemap.urlCountEstimated) {
    assumptions.push(
      `Inventory of ~${formatCount(sitemap.urlCount)} URLs is extrapolated from ${sitemap.childSitemapsFetched} of ${sitemap.childSitemapsTotal} child sitemaps, assuming they are uniformly sized; binary assets are not counted.`,
    );
  } else {
    assumptions.push(
      `Sitemap count (${formatCount(sitemap.urlCount)} URLs) is treated as the content corpus; binary assets are not counted.`,
    );
  }

  if (crawl.degraded) {
    assumptions.push(
      "Page sampling was limited or failed; form density and integrations are directional until a successful crawl.",
    );
  }

  if (crawl.stack?.primary && !isFrontendStack(crawl.stack.primary.id)) {
    assumptions.push(
      `Source stack fingerprint: ${crawl.stack.primary.label} (${crawl.stack.confidence} confidence). Confirm on a production authoring login before the SOW. Low-confidence hints do not change the score.`,
    );
  } else if (!crawl.degraded && crawl.succeeded > 0) {
    assumptions.push(
      "Source CMS was not identified from HTML fingerprints. Confirm the live platform before treating the target as settled.",
    );
  }

  if (input.demo) {
    assumptions.push(
      "Demo fixture (Northline Financial) is synthetic and for product review only.",
    );
  }

  assumptions.push(
    "Third-party licenses (DAM, search, personalization, translation) are already procured.",
  );

  return assumptions;
}

export function buildWhatWouldChange(
  input: EstimateInput,
  sitemap: SitemapSummary,
  crawl: CrawlSummary,
): string[] {
  return [
    sitemap.urlCount === 0
      ? "A complete sitemap or Cloud Manager package export that changes page count by more than ~25%."
      : "URL count landing well outside the inventoried sitemap (extra apps, gated PDFs, or microsites).",
    "Custom component count off by more than ~15, or a large share that must be net-new vs. mapped.",
    crawl.degraded
      ? "A successful page sample that reveals SSO, personalization, or commerce not visible here."
      : "Undocumented integrations beyond the signals already detected in HTML.",
    "A different target (for example AEMaaCS upgrade vs. leaving AEM) or adding commerce/PIM scope.",
    "Hard deadline that forces parallel site streams, or a content freeze the business will not honor.",
    input.languageCount > 1
      ? "Translation memory quality, or locales that are fully re-authored rather than inherited."
      : "Late addition of locales or language copies after the estimate is accepted.",
    "Regulatory, security review, or performance SLAs that require extra environments and test cycles.",
  ];
}
