import { uniqueValidUrls } from "./urls.ts";

/**
 * Pure sitemap document reading — no network, no Node built-ins.
 *
 * Split out from `sitemap.ts` so the fixtures can exercise it under
 * `node --experimental-strip-types` (see `lib/sitemap-fixtures.ts`). Keep this
 * module free of value imports other than `./urls.ts`, which imports nothing.
 *
 * The rule this module exists to enforce: a sitemap **index** lists other
 * sitemaps, not pages. Its <loc> values must never become the page inventory.
 */

/** Sampling cap. Not a cap on the reported inventory count. */
export const MAX_URLS = 4000;
const ROOT_PROBE_BYTES = 8192;

export type SitemapRoot = "index" | "urlset" | "unknown";

export interface ResolvedSitemap {
  /** Page URLs only, capped for sampling. Empty for an unresolved index. */
  urls: string[];
  /** True number of page URLs discovered. 0 means unknown. */
  urlCount: number;
  /** True when `urlCount` was extrapolated from a subset of child sitemaps. */
  urlCountEstimated: boolean;
  isIndex: boolean;
  childSitemapsTotal: number;
  childSitemapsFetched: number;
  /** An index whose children could not be read — inventory unknown. */
  indexUnresolved: boolean;
  parseError?: string;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Root element detection. Only the head of the document is probed — the root
 * tag is always near the top, and a 12MB document should not be re-scanned.
 */
export function detectRoot(xml: string): SitemapRoot {
  const head = xml.slice(0, ROOT_PROBE_BYTES);
  if (/<\s*(?:[A-Za-z0-9_.-]+:)?sitemapindex[\s>]/i.test(head)) return "index";
  if (/<\s*(?:[A-Za-z0-9_.-]+:)?urlset[\s>]/i.test(head)) return "urlset";
  return "unknown";
}

const LOC_RE =
  /<\s*(?:[A-Za-z0-9_.-]+:)?loc\b[^>]*>([\s\S]*?)<\s*\/\s*(?:[A-Za-z0-9_.-]+:)?loc\s*>/gi;
const CDATA_RE = /<!\[CDATA\[([\s\S]*?)\]\]>/;

function locText(raw: string): string {
  const cdata = raw.match(CDATA_RE);
  return decodeXml((cdata ? cdata[1] : raw).trim());
}

export interface SitemapScan {
  root: SitemapRoot;
  /** Every <loc> in the document, counted but not retained. */
  locCount: number;
  /** The first `sampleLimit` <loc> values. */
  locs: string[];
}

/** Single linear pass: count every <loc>, keep the first `sampleLimit`. */
export function scanSitemap(xml: string, sampleLimit: number): SitemapScan {
  let locCount = 0;
  const locs: string[] = [];
  LOC_RE.lastIndex = 0;
  for (;;) {
    const match = LOC_RE.exec(xml);
    if (!match) break;
    locCount += 1;
    if (locs.length < sampleLimit) {
      const value = locText(match[1]);
      if (value) locs.push(value);
    }
  }
  return { root: detectRoot(xml), locCount, locs };
}

export type SitemapDoc =
  | { kind: "urlset"; result: ResolvedSitemap }
  | { kind: "error"; result: ResolvedSitemap }
  /** Needs its children fetched before an inventory can be reported. */
  | { kind: "index"; children: string[]; childSitemapsTotal: number };

/** An index we could not resolve to pages: inventory is unknown, not zero pages. */
export function unresolvedIndex(childSitemapsTotal: number): ResolvedSitemap {
  return {
    urls: [],
    urlCount: 0,
    urlCountEstimated: false,
    isIndex: true,
    childSitemapsTotal,
    childSitemapsFetched: 0,
    indexUnresolved: true,
  };
}

/** Classify a sitemap document. Resolves urlsets outright; defers indexes. */
export function readSitemapDoc(xml: string, maxChildren: number): SitemapDoc {
  const scan = scanSitemap(xml, MAX_URLS);

  if (scan.locCount === 0) {
    return {
      kind: "error",
      result: {
        urls: [],
        urlCount: 0,
        urlCountEstimated: false,
        isIndex: scan.root === "index",
        childSitemapsTotal: 0,
        childSitemapsFetched: 0,
        indexUnresolved: false,
        parseError: "XML did not contain a urlset, sitemapindex, or <loc> tags",
      },
    };
  }

  if (scan.root === "index") {
    return {
      kind: "index",
      children: uniqueValidUrls(scan.locs, maxChildren),
      childSitemapsTotal: scan.locCount,
    };
  }

  // A urlset, or a loose document of <loc> tags, lists pages directly.
  return {
    kind: "urlset",
    result: {
      urls: uniqueValidUrls(scan.locs, MAX_URLS),
      urlCount: scan.locCount,
      urlCountEstimated: false,
      isIndex: false,
      childSitemapsTotal: 0,
      childSitemapsFetched: 0,
      indexUnresolved: false,
    },
  };
}

/**
 * Combine the child sitemaps that were readable into one inventory.
 *
 * Generators chunk indexes uniformly (25k or 50k URLs per file), so scaling the
 * children we read up to the full index is a sound approximation. It is always
 * surfaced as an estimate, never as a counted figure.
 */
export function combineChildScans(
  usable: SitemapScan[],
  childSitemapsTotal: number,
): ResolvedSitemap {
  if (usable.length === 0) return unresolvedIndex(childSitemapsTotal);

  const counted = usable.reduce((sum, entry) => sum + entry.locCount, 0);
  const sample: string[] = [];
  for (const entry of usable) {
    if (sample.length >= MAX_URLS) break;
    sample.push(...entry.locs.slice(0, MAX_URLS - sample.length));
  }

  const readAll = usable.length >= childSitemapsTotal;
  return {
    urls: uniqueValidUrls(sample, MAX_URLS),
    urlCount: readAll
      ? counted
      : Math.round((counted / usable.length) * childSitemapsTotal),
    urlCountEstimated: !readAll,
    isIndex: true,
    childSitemapsTotal,
    childSitemapsFetched: usable.length,
    indexUnresolved: false,
  };
}
