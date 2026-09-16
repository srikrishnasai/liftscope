/**
 * Regression fixtures for sitemap reading.
 *
 * Run with `npm run test:sitemap`. Executed by `node --experimental-strip-types`
 * and excluded from the Next tsconfig — do not import it from app code.
 *
 * The bug these exist to prevent: a sitemap **index** lists other sitemaps, not
 * pages. Returning its <loc> values as the page inventory scored gov.uk — about
 * 875,000 URLs — as a 35-page brochure site, and ran the CMS fingerprint against
 * XML instead of HTML.
 *
 * No network: `resolveSitemap` only fetches when `fetchChildren` is true, and
 * these cases leave it off.
 */

import {
  combineChildScans,
  detectRoot,
  readSitemapDoc,
  scanSitemap,
  unresolvedIndex,
  type ResolvedSitemap,
  type SitemapScan,
} from "./sitemap-parse.ts";

/** Mirrors resolveSitemap() for documents that need no network. */
function resolveOffline(xml: string): ResolvedSitemap {
  const doc = readSitemapDoc(xml, 8);
  return doc.kind === "index" ? unresolvedIndex(doc.childSitemapsTotal) : doc.result;
}

let failures = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const pass = actual === expected;
  if (!pass) failures += 1;
  console.log(
    `${pass ? "ok  " : "FAIL"} ${name}${pass ? "" : `  (got ${String(actual)}, want ${String(expected)})`}`,
  );
}

const urlset = (locs: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs.map((l) => `  <url><loc>${l}</loc><lastmod>2026-01-01</lastmod></url>`).join("\n")}
</urlset>`;

const index = (locs: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs.map((l) => `  <sitemap><loc>${l}</loc></sitemap>`).join("\n")}
</sitemapindex>`;

console.log("— root detection —");
check("urlset", detectRoot(urlset(["https://a.example/1"])), "urlset");
check("sitemapindex", detectRoot(index(["https://a.example/s1.xml"])), "index");
check(
  "namespaced urlset",
  detectRoot(`<?xml version="1.0"?><sm:urlset xmlns:sm="x"><sm:url/></sm:urlset>`),
  "urlset",
);
check(
  "namespaced index",
  detectRoot(`<?xml version="1.0"?><sm:sitemapindex xmlns:sm="x"></sm:sitemapindex>`),
  "index",
);
check("html is not a sitemap", detectRoot("<!doctype html><html><body>hi"), "unknown");
check("empty", detectRoot(""), "unknown");

console.log("\n— loc scanning —");
{
  const scan = scanSitemap(urlset(["https://a.example/1", "https://a.example/2"]), 10);
  check("counts locs", scan.locCount, 2);
  check("keeps locs", scan.locs.join(","), "https://a.example/1,https://a.example/2");
}
{
  // Count must be the true total even when the sample is capped.
  const many = Array.from({ length: 500 }, (_, i) => `https://a.example/${i}`);
  const scan = scanSitemap(urlset(many), 10);
  check("counts past the sample cap", scan.locCount, 500);
  check("sample respects the cap", scan.locs.length, 10);
}
{
  const cdata = `<urlset><url><loc><![CDATA[https://a.example/c?x=1&y=2]]></loc></url></urlset>`;
  const scan = scanSitemap(cdata, 5);
  check("unwraps CDATA", scan.locs[0], "https://a.example/c?x=1&y=2");
}
{
  const entities = `<urlset><url><loc>https://a.example/p?a=1&amp;b=2</loc></url></urlset>`;
  const scan = scanSitemap(entities, 5);
  check("decodes entities", scan.locs[0], "https://a.example/p?a=1&b=2");
}
{
  const messy = `<urlset><url><loc >\n  https://a.example/spaced  \n</loc ></url></urlset>`;
  const scan = scanSitemap(messy, 5);
  check("trims whitespace", scan.locs[0], "https://a.example/spaced");
}

console.log("\n— urlset resolution —");

function urlsetCases(): void {
  const many = Array.from({ length: 5000 }, (_, i) => `https://a.example/p${i}`);
  const resolved = resolveOffline(urlset(many));
  check("reports the true count, uncapped", resolved.urlCount, 5000);
  check("samples up to the cap", resolved.urls.length, 4000);
  check("not an index", resolved.isIndex, false);
  check("not estimated", resolved.urlCountEstimated, false);
  check("not unresolved", resolved.indexUnresolved, false);

  const empty = resolveOffline("<html><body>not a sitemap</body></html>");
  check("non-sitemap reports a parse error", Boolean(empty.parseError), true);
  check("non-sitemap has no urls", empty.urlCount, 0);
}

console.log("\n— index resolution (the regression) —");

function indexCases(): void {
  const children = Array.from({ length: 35 }, (_, i) => `https://a.example/sitemap_${i}.xml`);
  const doc = index(children);

  const resolved = resolveOffline(doc);
  check("index is flagged", resolved.isIndex, true);
  check("child sitemaps are NOT counted as pages", resolved.urlCount, 0);
  check("child sitemaps are NOT sampled as pages", resolved.urls.length, 0);
  check("index is marked unresolved", resolved.indexUnresolved, true);
  check("child total is retained", resolved.childSitemapsTotal, 35);
  check("no children were read", resolved.childSitemapsFetched, 0);
  check("unresolved is not a parse error", resolved.parseError, undefined);

  // The specific shape that produced the bad gov.uk score.
  const govish = resolveOffline(doc);
  check(
    "no child sitemap URL leaks into the page sample",
    govish.urls.some((u) => u.endsWith(".xml")),
    false,
  );
}

console.log("\n— child extrapolation —");

function scanOf(count: number): SitemapScan {
  return {
    root: "urlset",
    locCount: count,
    locs: Array.from({ length: Math.min(count, 50) }, (_, i) => `https://a.example/p${i}`),
  };
}

function extrapolationCases(): void {
  // The real gov.uk shape: 35 children of 25,000 URLs, 8 of them read.
  const govuk = combineChildScans(Array.from({ length: 8 }, () => scanOf(25_000)), 35);
  check("extrapolates to the full index", govuk.urlCount, 875_000);
  check("flags the count as estimated", govuk.urlCountEstimated, true);
  check("records children read", govuk.childSitemapsFetched, 8);
  check("records children listed", govuk.childSitemapsTotal, 35);
  check("resolved, not unknown", govuk.indexUnresolved, false);
  // 875,000 lands in the top page band; the old fallback scored this as 35.
  check("lands above the enterprise threshold", govuk.urlCount > 2500, true);

  // Every child read: report the exact count, not an estimate.
  const complete = combineChildScans([scanOf(100), scanOf(50), scanOf(25)], 3);
  check("exact count when all children read", complete.urlCount, 175);
  check("not flagged as estimated", complete.urlCountEstimated, false);

  // Uneven children still average out across the index.
  const uneven = combineChildScans([scanOf(1000), scanOf(500)], 10);
  check("averages uneven children", uneven.urlCount, 7500);

  // No readable child means unknown inventory, never zero pages.
  const none = combineChildScans([], 35);
  check("no readable children -> unknown", none.urlCount, 0);
  check("no readable children -> unresolved", none.indexUnresolved, true);
  check("no readable children -> no page sample", none.urls.length, 0);
}

urlsetCases();
indexCases();
extrapolationCases();

console.log(
  `\n${failures === 0 ? "All sitemap fixtures passed." : `${failures} fixture(s) FAILED.`}`,
);
if (failures > 0) process.exit(1);
