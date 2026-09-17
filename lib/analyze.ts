import { DEMO_INPUT, DEMO_PAGES, DEMO_SITEMAP_XML } from "./demo-fixture";
import { fetchAndClassify, MAX_PAGE_FETCHES } from "./fetch-pages";
import { assembleReport } from "./assemble";
import { aggregateStacks, looksLikeHtml, originHomeUrl } from "./detect-stack";
import { fetchText, resolveSitemap } from "./sitemap";
import { parseSampleUrls } from "./urls";
import { formatCount } from "./format";
import type {
  CrawlSummary,
  EstimateInput,
  EstimateReport,
  IntegrationSignal,
  PageClass,
  PageClassification,
  SitemapSource,
  SitemapSummary,
} from "./types";
import { INTEGRATION_SIGNALS, PAGE_CLASSES } from "./types";

const EMPTY_MIX = (): Record<PageClass, number> =>
  Object.fromEntries(PAGE_CLASSES.map((key) => [key, 0])) as Record<
    PageClass,
    number
  >;

function createReportId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `ls-${ts}-${rand}`;
}

function summarizeCrawl(pages: PageClassification[], notes: string[]): CrawlSummary {
  const succeeded = pages.filter((page) => page.fetchStatus !== "failed").length;
  const failed = pages.filter((page) => page.fetchStatus === "failed").length;
  const classMix = EMPTY_MIX();
  const signalSet = new Set<IntegrationSignal>();

  for (const page of pages) {
    if (page.fetchStatus === "failed") continue;
    classMix[page.pageClass] += 1;
    for (const signal of page.signals) signalSet.add(signal);
  }

  const scored = Math.max(1, succeeded);
  const formHeavyPct = Math.round((classMix["form-heavy"] / scored) * 100);
  const degraded =
    pages.length === 0 || failed === pages.length || succeeded === 0;

  const signals = INTEGRATION_SIGNALS.filter((signal) => signalSet.has(signal));
  const stack = aggregateStacks(pages);

  if (stack.primary) {
    notes.push(`Detected source stack: ${stack.summary}`);
  } else if (succeeded > 0) {
    notes.push(
      "No CMS fingerprint in sampled HTML. Could be a custom stack, a cached front end, or blocked assets — confirm the live platform before the SOW.",
    );
  }

  return {
    attempted: pages.length,
    succeeded,
    failed,
    pages,
    degraded,
    notes,
    classMix,
    signals,
    formHeavyPct: succeeded === 0 ? 0 : formHeavyPct,
    stack,
  };
}

function buildReport(
  id: string,
  input: EstimateInput,
  sitemap: SitemapSummary,
  pages: PageClassification[],
  notes: string[],
): EstimateReport {
  return assembleReport({
    id,
    createdAt: new Date().toISOString(),
    input,
    sitemap,
    crawl: summarizeCrawl(pages, notes),
  });
}

function normalizeInput(raw: EstimateInput): EstimateInput {
  return {
    ...raw,
    sitemapUrl: raw.sitemapUrl?.trim() || undefined,
    sitemapXml: raw.sitemapXml?.trim() || undefined,
    samplePageUrls: parseSampleUrls(raw.samplePageUrls),
    siteCount: Math.max(1, Math.min(200, Math.round(Number(raw.siteCount) || 1))),
    languageCount: Math.max(
      1,
      Math.min(80, Math.round(Number(raw.languageCount) || 1)),
    ),
    customComponentCount: Math.max(
      0,
      Math.min(2000, Math.round(Number(raw.customComponentCount) || 0)),
    ),
    repoCount: Math.max(1, Math.min(100, Math.round(Number(raw.repoCount) || 1))),
  };
}

export async function analyze(raw: EstimateInput): Promise<EstimateReport> {
  const id = createReportId();

  if (raw.demo) {
    const input = { ...DEMO_INPUT, ...normalizeInput({ ...DEMO_INPUT, ...raw, demo: true }) };
    const resolved = await resolveSitemap(DEMO_SITEMAP_XML, { fetchChildren: false });
    const sitemap: SitemapSummary = {
      source: "demo",
      urlCount: resolved.urlCount,
      sitemapIndex: resolved.isIndex,
      childSitemapsFetched: 0,
      sampleUrls: resolved.urls.slice(0, 12),
    };
    return buildReport(id, input, sitemap, DEMO_PAGES, [
      "Demo fixture: Northline Financial (synthetic three-site wealth brand). No live crawl was performed.",
    ]);
  }

  const input = normalizeInput(raw);
  const notes: string[] = [];
  let xml = input.sitemapXml;
  let source: SitemapSource = input.sitemapXml ? "upload" : "none";

  if (!xml && input.sitemapUrl) {
    const fetched = await fetchText(input.sitemapUrl);
    if (fetched.ok) {
      xml = fetched.text;
      source = "url";
    } else {
      notes.push(
        `Could not fetch sitemap at ${input.sitemapUrl}: ${fetched.error}. Estimate continues from form inputs${
          input.samplePageUrls?.length ? " and sample URLs" : ""
        }.`,
      );
    }
  }

  const extras: string[] = [];

  if (xml && looksLikeHtml(xml)) {
    notes.push(
      "The sitemap URL returned HTML rather than XML — treating it as a page sample for stack detection.",
    );
    if (input.sitemapUrl) extras.push(input.sitemapUrl);
    xml = undefined;
    if (source === "url") source = "none";
  }

  let urls: string[] = [];
  let urlCount = 0;
  let sitemapIndex = false;
  let childSitemapsFetched = 0;
  let childSitemapsTotal = 0;
  let urlCountEstimated = false;
  let indexUnresolved = false;
  let parseError: string | undefined;

  if (xml) {
    const resolved = await resolveSitemap(xml, { fetchChildren: source === "url" });
    urls = resolved.urls;
    urlCount = resolved.urlCount;
    sitemapIndex = resolved.isIndex;
    childSitemapsFetched = resolved.childSitemapsFetched;
    childSitemapsTotal = resolved.childSitemapsTotal;
    urlCountEstimated = resolved.urlCountEstimated;
    indexUnresolved = resolved.indexUnresolved;
    parseError = resolved.parseError;

    if (resolved.parseError) {
      notes.push(`Sitemap parse failed: ${resolved.parseError}`);
    } else if (resolved.indexUnresolved) {
      notes.push(
        source === "url"
          ? `Sitemap index lists ${childSitemapsTotal} child sitemaps, none of which could be read. A sitemap index lists sitemaps, not pages, so the page inventory is unknown and is scored as ~200. Point at one child sitemap for a real count.`
          : `The uploaded file is a sitemap index listing ${childSitemapsTotal} child sitemaps, not pages. Upload one child sitemap, or paste the sitemap URL so LiftScope can fetch them. Inventory is scored as ~200 until then.`,
      );
    } else if (resolved.urlCountEstimated) {
      notes.push(
        `Read ${childSitemapsFetched} of ${childSitemapsTotal} child sitemaps and extrapolated the inventory to ~${formatCount(urlCount)} URLs. Child sitemaps are normally uniform in size; confirm against the CMS before the SOW.`,
      );
    }
  } else if (!input.sitemapUrl && extras.length === 0) {
    notes.push(
      "No sitemap provided. Complexity uses scale inputs and an assumed ~200-page inventory.",
    );
  }

  const userSamples = input.samplePageUrls ?? [];
  const home = originHomeUrl(input.sitemapUrl);
  if (home && !userSamples.includes(home) && !urls.includes(home) && !extras.includes(home)) {
    extras.push(home);
  }
  const sitemapSamples = urls
    .filter((url) => !userSamples.includes(url) && !extras.includes(url))
    .slice(0, Math.max(0, MAX_PAGE_FETCHES - userSamples.length - extras.length));
  const toFetch = [...userSamples, ...extras, ...sitemapSamples].slice(
    0,
    MAX_PAGE_FETCHES,
  );

  let pages: PageClassification[] = [];
  if (toFetch.length > 0) {
    pages = await fetchAndClassify(toFetch);
    const failed = pages.filter((page) => page.fetchStatus === "failed").length;
    if (failed === pages.length) {
      notes.push(
        "All page fetches failed (blocked, timed out, or non-HTML). Estimate uses form inputs and sitemap counts only.",
      );
    } else if (failed > 0) {
      notes.push(`${failed} of ${pages.length} sampled pages could not be fetched.`);
    }
  } else {
    notes.push("No page URLs available to sample.");
  }

  const sitemap: SitemapSummary = {
    source,
    urlCount,
    sitemapIndex,
    childSitemapsFetched,
    childSitemapsTotal,
    urlCountEstimated,
    indexUnresolved,
    parseError,
    sampleUrls: toFetch,
  };

  return buildReport(id, input, sitemap, pages, notes);
}
