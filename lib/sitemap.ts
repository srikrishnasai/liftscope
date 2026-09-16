import { gunzipSync } from "node:zlib";
import { FETCH_TIMEOUT_MS, USER_AGENT } from "./fetch-pages";
import { safeFetch } from "./net-guard";
import {
  combineChildScans,
  MAX_URLS,
  readSitemapDoc,
  scanSitemap,
  unresolvedIndex,
  type ResolvedSitemap,
  type SitemapScan,
} from "./sitemap-parse";

/**
 * Sitemap fetching. The document reading itself lives in `sitemap-parse.ts`
 * (pure, and covered by `npm run test:sitemap`).
 */

const MAX_CHILD_SITEMAPS = 8;
const CHILD_CONCURRENCY = 3;
/** 50,000 URLs — the sitemap spec's per-file limit — runs about 11MB. */
const MAX_SITEMAP_BYTES = 12_000_000;
/** Ceiling on gunzip output so a small .gz cannot expand into a memory bomb. */
const MAX_XML_DECOMPRESSED_BYTES = 60_000_000;

export type { ResolvedSitemap } from "./sitemap-parse";
export { detectRoot, scanSitemap } from "./sitemap-parse";

function decodeSitemapBody(buffer: Buffer): string {
  const gzipMagic = buffer.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b]));
  if (!gzipMagic) return buffer.toString("utf8");
  const raw = gunzipSync(buffer, {
    maxOutputLength: MAX_XML_DECOMPRESSED_BYTES,
  });
  return raw.toString("utf8");
}

export async function fetchText(
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<{ ok: true; text: string; finalUrl: string } | { ok: false; error: string }> {
  const result = await safeFetch(url, {
    accept:
      "application/xml, text/xml, application/xhtml+xml, text/html;q=0.8, */*;q=0.5",
    timeoutMs,
    maxBytes: MAX_SITEMAP_BYTES,
    userAgent: USER_AGENT,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: result.error.startsWith("Response larger than")
        ? `Sitemap larger than ${MAX_SITEMAP_BYTES / 1_000_000}MB — point at a child sitemap instead`
        : result.error,
    };
  }

  try {
    return {
      ok: true,
      text: decodeSitemapBody(result.body),
      finalUrl: result.finalUrl,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not decode sitemap",
    };
  }
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => run()),
  );
  return results;
}

export async function resolveSitemap(
  xml: string,
  options: { fetchChildren?: boolean } = {},
): Promise<ResolvedSitemap> {
  const doc = readSitemapDoc(xml, MAX_CHILD_SITEMAPS);
  if (doc.kind !== "index") return doc.result;

  if (!options.fetchChildren) return unresolvedIndex(doc.childSitemapsTotal);

  const scans = await mapPool(doc.children, CHILD_CONCURRENCY, async (child) => {
    const fetched = await fetchText(child);
    if (!fetched.ok) return null;
    const scan = scanSitemap(fetched.text, MAX_URLS);
    // Nested indexes are not followed — one level is enough for an estimate.
    if (scan.root === "index" || scan.locCount === 0) return null;
    return scan;
  });

  return combineChildScans(
    scans.filter((entry): entry is SitemapScan => entry !== null),
    doc.childSitemapsTotal,
  );
}

export { parseSampleUrls } from "./urls";
