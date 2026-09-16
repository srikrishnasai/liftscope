export const MIGRATION_TARGETS = [
  "aemaacs-upgrade",
  "aem-to-other",
  "other-to-aem",
] as const;

export type MigrationTarget = (typeof MIGRATION_TARGETS)[number];

export const TARGET_LABELS: Record<MigrationTarget, string> = {
  "aemaacs-upgrade": "AEMaaCS upgrade",
  "aem-to-other": "AEM → other CMS",
  "other-to-aem": "other CMS → AEM",
};

export const PAGE_CLASSES = [
  "landing",
  "article",
  "product",
  "form-heavy",
  "other",
] as const;

export type PageClass = (typeof PAGE_CLASSES)[number];

export const INTEGRATION_SIGNALS = [
  "analytics",
  "forms",
  "sso",
  "personalization",
  "commerce",
  "search",
] as const;

export type IntegrationSignal = (typeof INTEGRATION_SIGNALS)[number];

export type SitemapSource = "url" | "upload" | "demo" | "none";

/** How a report unlock was granted. "demo"/"free" need no payment. */
export type UnlockSource = "razorpay" | "demo" | "free";

export type FetchStatus = "ok" | "failed" | "skipped" | "fixture";

export const CMS_STACK_IDS = [
  "aem",
  "wordpress",
  "drupal",
  "sitecore",
  "contentful",
  "contentstack",
  "sanity",
  "strapi",
  "shopify",
  "magento",
  "webflow",
  "optimizely",
  "umbraco",
  "hubspot",
  "nextjs",
  "nuxt",
  "sharepoint",
  "squarespace",
  "wix",
  "unknown",
] as const;

export type CmsStackId = (typeof CMS_STACK_IDS)[number];

export interface StackHint {
  id: CmsStackId;
  evidence: string[];
  score?: number;
}

export interface StackEvidence {
  id: CmsStackId;
  label: string;
  score: number;
  evidence: string[];
  pages: number;
  kind?: "cms" | "frontend";
}

export interface StackDetection {
  primary: StackEvidence | null;
  others: StackEvidence[];
  confidence: "high" | "medium" | "low" | "none";
  summary: string;
}

export type RiskSeverity = "high" | "medium" | "low";

export interface EstimateInput {
  sitemapUrl?: string;
  sitemapXml?: string;
  samplePageUrls?: string[];
  target: MigrationTarget;
  siteCount: number;
  languageCount: number;
  customComponentCount: number;
  demo?: boolean;
}

export interface PageClassification {
  url: string;
  pageClass: PageClass;
  signals: IntegrationSignal[];
  title?: string;
  fetchStatus: FetchStatus;
  error?: string;
  stackHints?: StackHint[];
}

export interface ScoreDriver {
  id: string;
  label: string;
  points: number;
  detail: string;
}

export interface EffortBand {
  low: number;
  mid: number;
  high: number;
}

export interface Risk {
  id: string;
  title: string;
  explanation: string;
  severity: RiskSeverity;
  triggeredBy: string[];
}

export interface PlanPhase {
  id: "discovery" | "pilot" | "bulk" | "cutover" | "hypercare";
  name: string;
  weeks: { low: number; high: number };
  bullets: string[];
}

export interface SitemapSummary {
  source: SitemapSource;
  /** Page URLs discovered. 0 means unknown, never "an index we could not read". */
  urlCount: number;
  sitemapIndex: boolean;
  childSitemapsFetched: number;
  parseError?: string;
  sampleUrls: string[];
  urlCountOverridden?: boolean;
  /** Child sitemaps listed by an index, whether or not they were read. */
  childSitemapsTotal?: number;
  /** `urlCount` was extrapolated from the child sitemaps that were read. */
  urlCountEstimated?: boolean;
  /** An index whose children could not be read — inventory unknown. */
  indexUnresolved?: boolean;
}

export interface AssumptionOverrides {
  pageCount: number;
  siteCount: number;
  languageCount: number;
  customComponentCount: number;
  formHeavyPct: number;
  signals: IntegrationSignal[];
  target: MigrationTarget;
}

export interface CrawlSummary {
  attempted: number;
  succeeded: number;
  failed: number;
  pages: PageClassification[];
  degraded: boolean;
  notes: string[];
  classMix: Record<PageClass, number>;
  signals: IntegrationSignal[];
  formHeavyPct: number;
  formHeavyOverridden?: boolean;
  signalsOverridden?: boolean;
  stack?: StackDetection;
}

export interface ScoreAdjustments {
  extraDrivers: ScoreDriver[];
  effortMultiplier: number;
  extraRisks: Risk[];
  assumptions: string[];
}

export interface EstimateReport {
  id: string;
  createdAt: string;
  rubricVersion: string;
  input: EstimateInput;
  sitemap: SitemapSummary;
  crawl: CrawlSummary;
  score: {
    complexity: number;
    raw: number;
    drivers: ScoreDriver[];
    narrative: string;
  };
  effort: EffortBand;
  risks: Risk[];
  plan: PlanPhase[];
  assumptions: string[];
  whatWouldChange: string[];
}
