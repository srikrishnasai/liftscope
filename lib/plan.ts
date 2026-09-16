import { isFrontendStack } from "./detect-stack";
import type {
  CrawlSummary,
  EffortBand,
  EstimateInput,
  PlanPhase,
} from "./types";
import { TARGET_LABELS } from "./types";

const SHARES: { id: PlanPhase["id"]; name: string; share: number }[] = [
  { id: "discovery", name: "Discovery", share: 0.14 },
  { id: "pilot", name: "Pilot", share: 0.18 },
  { id: "bulk", name: "Bulk migration", share: 0.44 },
  { id: "cutover", name: "Cutover", share: 0.12 },
  { id: "hypercare", name: "Hypercare", share: 0.12 },
];

function weeksFor(total: number, share: number): number {
  return Math.max(1, Math.round(total * share));
}

export function buildPhasedPlan(
  input: EstimateInput,
  effort: EffortBand,
  crawl: CrawlSummary,
): PlanPhase[] {
  const target = TARGET_LABELS[input.target];
  const multiSite = input.siteCount > 1;
  const multiLang = input.languageCount > 1;

  const bullets: Record<PlanPhase["id"], string[]> = {
    discovery: [
      `Confirm ${target} scope, success metrics, and in/out list with stakeholders.`,
      crawl.stack?.primary && !isFrontendStack(crawl.stack.primary.id)
        ? `Confirm live source stack is ${crawl.stack.primary.label} (HTML fingerprint only — not an authoring login).`
        : "Confirm the live source CMS — HTML fingerprints did not identify an authoring platform.",
      `Inventory templates, ${input.customComponentCount || "declared"} custom components, and DAM vs. static media.`,
      crawl.degraded
        ? "Re-run a full sitemap/package scan — this estimate used a partial inventory."
        : `Validate the ${crawl.succeeded} sampled page types against authoring templates.`,
      multiLang
        ? `Map ${input.languageCount} locales, live-copy rules, and translation vendors.`
        : "Confirm single-locale URL and metadata conventions.",
    ],
    pilot: [
      `Migrate one representative template set (${
        crawl.classMix.landing ? "landing + " : ""
      }core interior) end-to-end.`,
      crawl.signals.includes("forms")
        ? "Prove one lead-gen form through the real CRM/endpoint, including hidden fields."
        : "Stand up a reference form even if samples were light — authors will need it.",
      crawl.signals.includes("sso")
        ? "Wire SSO in a lower environment and test gated pages before scaling."
        : "Document authentication assumptions so gated pages are not a late surprise.",
      "Freeze a redirect sample and analytics events for the pilot hostnames.",
    ],
    bulk: [
      multiSite
        ? `Roll remaining ${input.siteCount} sites in waves, sharing the pilot component set.`
        : "Scale the remaining templates and content after pilot sign-off.",
      `Authoring + engineering pair on the remaining custom components (${input.customComponentCount} declared).`,
      crawl.signals.includes("personalization")
        ? "Export and rebuild personalization activities; freeze new campaigns near cutover."
        : "Keep campaign and fragment inventory current as bulk content lands.",
      "Maintain a living redirect matrix and broken-link report as URLs land.",
    ],
    cutover: [
      "DNS, CDN, and robots/sitemap switch with a timed rollback.",
      crawl.signals.includes("search")
        ? "Re-point search collections and run a full index before announcing go-live."
        : "Submit updated sitemaps and spot-check canonical/hreflang on priority URLs.",
      "Author read-only window, content freeze, and comms to marketing and support.",
    ],
    hypercare: [
      "Daily defect triage: 404s, forms, tags, and authoring gaps.",
      "SEO and analytics parity review against the pre-launch baseline.",
      "Knowledge transfer: template governance, component backlog, and runbooks.",
    ],
  };

  return SHARES.map((phase) => ({
    id: phase.id,
    name: phase.name,
    weeks: {
      low: weeksFor(effort.low, phase.share),
      high: weeksFor(effort.high, phase.share),
    },
    bullets: bullets[phase.id],
  }));
}
