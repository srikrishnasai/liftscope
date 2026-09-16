import { stackAlignment, stackIsActionable } from "./detect-stack";
import type {
  CrawlSummary,
  EstimateInput,
  Risk,
  SitemapSummary,
} from "./types";

interface RiskRule {
  id: string;
  title: string;
  explanation: string;
  severity: Risk["severity"];
  weight: (ctx: RiskContext) => number;
  triggeredBy: (ctx: RiskContext) => string[];
}

interface RiskContext {
  input: EstimateInput;
  sitemap: SitemapSummary;
  crawl: CrawlSummary;
}

const RULES: RiskRule[] = [
  {
    id: "limited-visibility",
    title: "Limited inventory visibility",
    explanation:
      "The sitemap or page sample could not be fully read. Effort bands will move once URL counts, templates, and integrations are confirmed from a complete crawl or package export.",
    severity: "high",
    weight: ({ sitemap, crawl }) =>
      sitemap.parseError || crawl.degraded || sitemap.source === "none" ? 12 : 0,
    triggeredBy: ({ sitemap, crawl }) => {
      const reasons: string[] = [];
      if (sitemap.parseError) reasons.push("sitemap-parse");
      if (crawl.degraded) reasons.push("crawl-degraded");
      if (sitemap.source === "none") reasons.push("no-sitemap");
      return reasons;
    },
  },
  {
    id: "multi-site",
    title: "Multi-site inheritance and rollout",
    explanation:
      "Several sites usually share templates, live copies, or a design system. Expect MSM/blueprint decisions, staggered launches, and regression across brands — not a single cutover.",
    severity: "high",
    weight: ({ input }) =>
      input.siteCount >= 5 ? 11 : input.siteCount >= 2 ? 8 : 0,
    triggeredBy: ({ input }) =>
      input.siteCount >= 2 ? [`sites:${input.siteCount}`] : [],
  },
  {
    id: "localization",
    title: "Localization and translation memory",
    explanation:
      "Multiple locales add URL strategy, language-copy relationships, and vendor workflows. Missing translation memory or mixed authored/machine copy will inflate both content and QA.",
    severity: "high",
    weight: ({ input }) =>
      input.languageCount >= 6 ? 10 : input.languageCount >= 3 ? 8 : 0,
    triggeredBy: ({ input }) =>
      input.languageCount >= 3 ? [`languages:${input.languageCount}`] : [],
  },
  {
    id: "component-rewrite",
    title: "Custom component rewrite",
    explanation:
      "A large custom component catalog rarely ports 1:1. Plan for mapping workshops, design-system alignment, and visual QA — especially dialogs, tabs, and authoring-only behaviors.",
    severity: "high",
    weight: ({ input }) =>
      input.customComponentCount >= 80
        ? 11
        : input.customComponentCount >= 25
          ? 8
          : input.customComponentCount >= 10
            ? 5
            : 0,
    triggeredBy: ({ input }) =>
      input.customComponentCount >= 10
        ? [`components:${input.customComponentCount}`]
        : [],
  },
  {
    id: "forms-integrations",
    title: "Forms and lead-generation integrations",
    explanation:
      "Form-heavy templates typically hide CRM endpoints, hidden fields, and validation rules. Recreating them without a field-level inventory is a common source of go-live defects.",
    severity: "high",
    weight: ({ crawl }) => {
      const forms = crawl.signals.includes("forms");
      if (crawl.formHeavyPct >= 20 || forms) return 9;
      if (crawl.formHeavyPct >= 8) return 6;
      return 0;
    },
    triggeredBy: ({ crawl }) => {
      const tags: string[] = [];
      if (crawl.signals.includes("forms")) tags.push("forms");
      if (crawl.formHeavyPct >= 8) tags.push(`form-heavy:${crawl.formHeavyPct}%`);
      return tags;
    },
  },
  {
    id: "identity",
    title: "Identity and SSO cutover",
    explanation:
      "SSO hints in the HTML (Okta, Azure AD, SAML, Auth0) mean login, gated content, and session cookies must be proven in a lower environment before production DNS moves.",
    severity: "high",
    weight: ({ crawl }) => (crawl.signals.includes("sso") ? 9 : 0),
    triggeredBy: ({ crawl }) => (crawl.signals.includes("sso") ? ["sso"] : []),
  },
  {
    id: "personalization",
    title: "Personalization and experimentation",
    explanation:
      "Target, Optimizely, or similar tags imply audiences, offers, and activities that are invisible in a sitemap. Rebuilding them needs activity exports and a freeze window around launch.",
    severity: "medium",
    weight: ({ crawl }) => (crawl.signals.includes("personalization") ? 8 : 0),
    triggeredBy: ({ crawl }) =>
      crawl.signals.includes("personalization") ? ["personalization"] : [],
  },
  {
    id: "analytics-parity",
    title: "Analytics and tag parity",
    explanation:
      "Marketing will treat tag gaps as launch blockers. Inventory data layer events, consent mode, and Adobe/Google property mapping before the first production content load.",
    severity: "medium",
    weight: ({ crawl }) => (crawl.signals.includes("analytics") ? 6 : 2),
    triggeredBy: ({ crawl }) =>
      crawl.signals.includes("analytics") ? ["analytics"] : ["assumed-tags"],
  },
  {
    id: "content-model",
    title: "Content model mismatch",
    explanation:
      "Moving off AEM usually means collapsing experience fragments, content fragments, and page templates into a flatter CMS model. Unmapped fields become manual authoring after go-live.",
    severity: "high",
    weight: ({ input }) => (input.target === "aem-to-other" ? 9 : 0),
    triggeredBy: ({ input }) =>
      input.target === "aem-to-other" ? ["target:aem-to-other"] : [],
  },
  {
    id: "aem-rebuild",
    title: "AEM authoring model rebuild",
    explanation:
      "Landing on AEM requires editable templates, policies, and component dialogs — not just HTML. Underestimating author training and template governance is a frequent overrun.",
    severity: "high",
    weight: ({ input }) => (input.target === "other-to-aem" ? 8 : 0),
    triggeredBy: ({ input }) =>
      input.target === "other-to-aem" ? ["target:other-to-aem"] : [],
  },
  {
    id: "stack-mismatch",
    title: "Source stack does not match the selected target",
    explanation:
      "HTML fingerprints (scripts, generator tags, asset paths) point at a different CMS than the migration target. Confirm the live platform before locking the SOW — an AEM upgrade plan on a WordPress estate, or the reverse, will miss the real work.",
    severity: "high",
    weight: ({ input, crawl }) => {
      if (!stackIsActionable(crawl.stack)) return 0;
      const id = crawl.stack?.primary?.id;
      if (!id) return 0;
      return stackAlignment(id, input.target) === "mismatch" ? 11 : 0;
    },
    triggeredBy: ({ crawl }) =>
      stackIsActionable(crawl.stack) && crawl.stack?.primary
        ? [`stack:${crawl.stack.primary.id}`]
        : [],
  },
  {
    id: "cloud-constraints",
    title: "AEMaaCS pipeline and dispatcher constraints",
    explanation:
      "Cloud Service rejects mutable repo patterns, legacy OSGi configs, and some on-prem dispatcher tricks. Budget a dedicated compatibility spike before promising the upgrade date.",
    severity: "medium",
    weight: ({ input }) => (input.target === "aemaacs-upgrade" ? 8 : 0),
    triggeredBy: ({ input }) =>
      input.target === "aemaacs-upgrade" ? ["target:aemaacs-upgrade"] : [],
  },
  {
    id: "seo-urls",
    title: "SEO and URL mapping",
    explanation:
      "A large URL set needs a redirect matrix, canonical rules, and sitemap cutover. High-traffic landing pages should be proven in the pilot, not discovered in week one of hypercare.",
    severity: "medium",
    weight: ({ sitemap }) =>
      sitemap.urlCount >= 800 ? 8 : sitemap.urlCount >= 150 ? 6 : 3,
    triggeredBy: ({ sitemap }) =>
      sitemap.urlCount > 0 ? [`urls:${sitemap.urlCount}`] : ["urls:unknown"],
  },
  {
    id: "commerce",
    title: "Commerce or product catalog coupling",
    explanation:
      "Product-like pages and commerce scripts suggest PIM, pricing, or cart dependencies. Treat those templates as a separate workstream from marketing pages.",
    severity: "high",
    weight: ({ crawl }) =>
      crawl.signals.includes("commerce") || crawl.classMix.product >= 2
        ? 8
        : 0,
    triggeredBy: ({ crawl }) => {
      const tags: string[] = [];
      if (crawl.signals.includes("commerce")) tags.push("commerce");
      if (crawl.classMix.product >= 2) tags.push("product-pages");
      return tags;
    },
  },
  {
    id: "search",
    title: "Search index rebuild",
    explanation:
      "Coveo, Algolia, or Solr tags mean collections, synonyms, and result templates must be re-pointed. Search quality is a common week-two complaint if it is left until cutover.",
    severity: "medium",
    weight: ({ crawl }) => (crawl.signals.includes("search") ? 7 : 0),
    triggeredBy: ({ crawl }) =>
      crawl.signals.includes("search") ? ["search"] : [],
  },
  {
    id: "dam",
    title: "DAM and media migration",
    explanation:
      "Even without a package scan, large sites carry renditions, rights metadata, and broken-asset risk. Confirm DAM vs. static hosting before promising a big-bang media move.",
    severity: "medium",
    weight: ({ sitemap, input }) =>
      sitemap.urlCount >= 200 || input.siteCount >= 2 ? 5 : 3,
    triggeredBy: () => ["assumed-dam"],
  },
];

export function buildRiskRegister(
  input: EstimateInput,
  sitemap: SitemapSummary,
  crawl: CrawlSummary,
  limit = 8,
): Risk[] {
  const ctx = { input, sitemap, crawl };
  return RULES.map((rule) => ({
    rule,
    weight: rule.weight(ctx),
    triggeredBy: rule.triggeredBy(ctx),
  }))
    .filter((row) => row.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map(({ rule, triggeredBy }) => ({
      id: rule.id,
      title: rule.title,
      explanation: rule.explanation,
      severity: rule.severity,
      triggeredBy,
    }));
}
