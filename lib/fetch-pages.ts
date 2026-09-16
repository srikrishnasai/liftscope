import type { IntegrationSignal, PageClass, PageClassification } from "./types";
import { detectStackOnPage } from "./detect-stack";
import { safeFetch } from "./net-guard";

export const USER_AGENT =
  "LiftScope/1.0 (CMS migration estimator; +https://liftscope.app)";
export const FETCH_TIMEOUT_MS = 8000;
export const MAX_PAGE_FETCHES = 12;
/** Read ceiling per page. Only the first 400KB is kept for classification. */
export const MAX_PAGE_BYTES = 1_000_000;
const CONCURRENCY = 3;

const SIGNAL_PATTERNS: { signal: IntegrationSignal; pattern: RegExp }[] = [
  {
    signal: "analytics",
    pattern:
      /googletagmanager|gtag\(|google-analytics|_satellite|adobetm|omniture|hotjar|cdn\.segment\.com|mixpanel|tealium|newrelic|adobe\.launch|assets\.adobedtm/i,
  },
  {
    signal: "forms",
    pattern:
      /marketo|mktoform|hubspot|salesforce|pardot|eloqua|aemform|wufoo|typeform|formstack|gravityform/i,
  },
  {
    signal: "sso",
    pattern:
      /okta|auth0|pingfederate|saml|oauth2|login\.microsoftonline|sso\.|onelogin|adfs|openid-connect/i,
  },
  {
    signal: "personalization",
    pattern:
      /adobe\.target|mboxcreate|optimizely|dynamicyield|evergage|at\.js|personalization|adobe\.target/i,
  },
  {
    signal: "commerce",
    pattern:
      /add-to-cart|addtocart|hybris|magento|commercecloud|shopify|product-price|data-sku/i,
  },
  {
    signal: "search",
    pattern: /coveo|algolia|solr|elasticsearch|searchspring|atomic-search/i,
  },
];

export function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return undefined;
  return match[1].replace(/\s+/g, " ").trim().slice(0, 160) || undefined;
}

export function detectSignals(html: string): IntegrationSignal[] {
  return SIGNAL_PATTERNS.filter(({ pattern }) => pattern.test(html)).map(
    ({ signal }) => signal,
  );
}

export function classifyHtml(url: string, html: string): PageClass {
  const lower = html.toLowerCase();
  const formCount = (html.match(/<form\b/gi) ?? []).length;
  const inputCount = (html.match(/<input\b/gi) ?? []).length;

  if (
    formCount >= 2 ||
    inputCount >= 8 ||
    /application-form|lead-form|contact-form/.test(lower)
  ) {
    return "form-heavy";
  }

  if (
    /itemtype=["']https?:\/\/schema\.org\/product/i.test(html) ||
    /add-to-cart|addtocart|product-sku|data-sku/.test(lower)
  ) {
    return "product";
  }

  if (
    /<article\b/i.test(html) ||
    /itemtype=["']https?:\/\/schema\.org\/article/i.test(html) ||
    /rel=["']author["']/.test(lower)
  ) {
    return "article";
  }

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const ctaCount = (
    html.match(/btn|button|cta|sign.?up|get.?started|contact.?us|request.?demo/gi) ??
    []
  ).length;
  const pathHint = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();

  if (
    /\/(home|landing|campaign|promo|lp)\b/.test(pathHint) ||
    (text.length < 2500 && ctaCount >= 4)
  ) {
    return "landing";
  }

  if (/\/(blog|news|article|insights)\b/.test(pathHint)) return "article";
  if (/\/(product|shop|fund)\b/.test(pathHint)) return "product";
  if (/\/(contact|apply|quote|register)\b/.test(pathHint)) return "form-heavy";

  return "other";
}

export function classifyPage(
  url: string,
  html: string,
  fetchStatus: PageClassification["fetchStatus"] = "ok",
  headers: Record<string, string> = {},
): PageClassification {
  return {
    url,
    pageClass: classifyHtml(url, html),
    signals: detectSignals(html),
    title: extractTitle(html),
    fetchStatus,
    stackHints: detectStackOnPage(url, html, headers),
  };
}

async function fetchHtml(
  url: string,
): Promise<
  | { ok: true; html: string; headers: Record<string, string> }
  | { ok: false; error: string }
> {
  const result = await safeFetch(url, {
    accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
    timeoutMs: FETCH_TIMEOUT_MS,
    maxBytes: MAX_PAGE_BYTES,
    userAgent: USER_AGENT,
    // Classification only reads the head of the document — keep what arrived
    // rather than losing a large page entirely.
    onOverflow: "truncate",
  });
  if (!result.ok) return { ok: false, error: result.error };

  const contentType = result.headers["content-type"] ?? "";
  if (
    contentType &&
    !contentType.includes("html") &&
    !contentType.includes("xml") &&
    !contentType.includes("text/")
  ) {
    return { ok: false, error: `Unsupported content-type ${contentType}` };
  }

  return {
    ok: true,
    html: result.body.toString("utf8").slice(0, 400_000),
    headers: result.headers,
  };
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

export async function fetchAndClassify(
  urls: string[],
): Promise<PageClassification[]> {
  const capped = urls.slice(0, MAX_PAGE_FETCHES);
  return mapPool(capped, CONCURRENCY, async (url) => {
    const result = await fetchHtml(url);
    if (!result.ok) {
      return {
        url,
        pageClass: "other" as const,
        signals: [],
        fetchStatus: "failed" as const,
        error: result.error,
        stackHints: detectStackOnPage(url, "", {}),
      };
    }
    return classifyPage(url, result.html, "ok", result.headers);
  });
}
