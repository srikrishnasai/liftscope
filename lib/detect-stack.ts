import type { CmsStackId, StackDetection, StackEvidence, StackHint } from "./types";

export const CMS_STACK_LABELS: Record<CmsStackId, string> = {
  aem: "Adobe Experience Manager",
  wordpress: "WordPress",
  drupal: "Drupal",
  sitecore: "Sitecore",
  contentful: "Contentful",
  contentstack: "Contentstack",
  sanity: "Sanity",
  strapi: "Strapi",
  shopify: "Shopify",
  magento: "Adobe Commerce / Magento",
  webflow: "Webflow",
  optimizely: "Optimizely CMS (Episerver)",
  umbraco: "Umbraco",
  hubspot: "HubSpot CMS",
  nextjs: "Next.js / headless",
  nuxt: "Nuxt",
  sharepoint: "SharePoint",
  squarespace: "Squarespace",
  wix: "Wix",
  unknown: "Unknown / not identified",
};

const FRONTEND_STACKS = new Set<CmsStackId>(["nextjs", "nuxt"]);

export function isFrontendStack(id?: CmsStackId | null): boolean {
  return Boolean(id && FRONTEND_STACKS.has(id));
}

export function stackIsActionable(
  stack?: { primary?: { id: CmsStackId } | null; confidence?: StackDetection["confidence"] } | null,
): boolean {
  const id = stack?.primary?.id;
  if (!id || id === "unknown" || isFrontendStack(id)) return false;
  return stack?.confidence === "high" || stack?.confidence === "medium";
}

/**
 * Match a `<meta name="generator">` tag whose content names a platform.
 *
 * Scoped to the tag rather than the whole document on purpose: the *name* of a
 * CMS appearing in body copy says nothing about what the page runs on. A site
 * about AEM, a blog post comparing Drupal to WordPress, or an agency listing
 * the platforms it works with will all mention them on every page.
 *
 * Both attribute orders are accepted since either is valid HTML.
 */
function GENERATOR_RE(product: RegExp): RegExp {
  const p = product.source;
  return new RegExp(
    `<meta[^>]*\\bname=["']generator["'][^>]*\\bcontent=["'][^"']*(?:${p})` +
      `|<meta[^>]*\\bcontent=["'][^"']*(?:${p})[^"']*["'][^>]*\\bname=["']generator["']`,
    "i",
  );
}

interface Fingerprint {
  id: Exclude<CmsStackId, "unknown">;
  html: { re: RegExp; evidence: string; weight: number }[];
  url: { re: RegExp; evidence: string; weight: number }[];
  header: { name: string; re: RegExp; evidence: string; weight: number }[];
}

const FINGERPRINTS: Fingerprint[] = [
  {
    id: "aem",
    html: [
      { re: /\/etc\.clientlibs\//i, evidence: "/etc.clientlibs", weight: 6 },
      { re: /\/content\/dam\//i, evidence: "/content/dam", weight: 4 },
      { re: /wcmmode|coral-ui|granite\/ui|granite\.utils/i, evidence: "AEM/Granite markers", weight: 5 },
      { re: /\baem-Grid\b|\baem-grid\b/i, evidence: "aem-Grid", weight: 5 },
      // Must be an actual generator tag, not the phrase in body copy. A site
      // *about* AEM (aeminsider.com: "Learn Adobe Experience Manager from the
      // ground up") says the words on every page; that is not evidence of the
      // platform it runs on. Both attribute orders, since either is valid HTML.
      {
        re: GENERATOR_RE(/adobe experience manager|adobe-aem|day communique/),
        evidence: "generator=Adobe Experience Manager",
        weight: 6,
      },
    ],
    url: [{ re: /\/etc\.clientlibs\//i, evidence: "AEM path", weight: 3 }],
    header: [
      { name: "dispatcher", re: /./, evidence: "Dispatcher header", weight: 3 },
      { name: "x-aem", re: /./, evidence: "x-aem header", weight: 4 },
    ],
  },
  {
    id: "wordpress",
    html: [
      { re: /\/wp-content\//i, evidence: "/wp-content", weight: 3 },
      { re: /\/wp-includes\//i, evidence: "/wp-includes", weight: 5 },
      { re: /\/wp-json\//i, evidence: "WP REST API", weight: 5 },
      { re: /name=["']generator["'][^>]*wordpress/i, evidence: "generator=WordPress", weight: 6 },
    ],
    url: [{ re: /\/wp-includes\/|\/wp-json\//i, evidence: "WordPress path", weight: 3 }],
    header: [{ name: "link", re: /wp-json/i, evidence: "Link: wp-json", weight: 5 }],
  },
  {
    id: "drupal",
    html: [
      { re: /\/sites\/default\/files\//i, evidence: "/sites/default/files", weight: 5 },
      { re: /drupal\.settings|drupal-settings-json/i, evidence: "Drupal.settings", weight: 5 },
      { re: /\/core\/misc\//i, evidence: "Drupal core assets", weight: 3 },
      { re: /name=["']generator["'][^>]*drupal/i, evidence: "generator=Drupal", weight: 6 },
    ],
    url: [{ re: /\/sites\/default\/files\//i, evidence: "Drupal files path", weight: 3 }],
    header: [
      { name: "x-drupal-cache", re: /./, evidence: "x-drupal-cache", weight: 5 },
      { name: "x-generator", re: /drupal/i, evidence: "x-generator Drupal", weight: 5 },
    ],
  },
  {
    id: "sitecore",
    html: [
      { re: /\/sitecore\//i, evidence: "/sitecore", weight: 5 },
      { re: /sc_device|sitecore_id|sitecore\.axd/i, evidence: "Sitecore markers", weight: 4 },
    ],
    url: [{ re: /\/sitecore\//i, evidence: "Sitecore path", weight: 3 }],
    header: [{ name: "set-cookie", re: /sc_analytics|sitecore/i, evidence: "Sitecore cookie", weight: 3 }],
  },
  {
    id: "contentful",
    html: [
      {
        re: /(?:src|content)=["'][^"']*(?:cdn\.contentful\.com|images\.ctfassets\.net|videos\.ctfassets\.net)/i,
        evidence: "Contentful CDN asset",
        weight: 5,
      },
    ],
    url: [],
    header: [{ name: "x-contentful", re: /./, evidence: "x-contentful header", weight: 4 }],
  },
  {
    id: "contentstack",
    html: [
      {
        re: /images\.contentstack\.io|cdn\.contentstack\.io/i,
        evidence: "Contentstack CDN",
        weight: 5,
      },
    ],
    url: [],
    header: [],
  },
  {
    id: "sanity",
    html: [{ re: /cdn\.sanity\.io/i, evidence: "Sanity CDN", weight: 5 }],
    url: [],
    header: [],
  },
  {
    id: "strapi",
    html: [{ re: /\/uploads\/[a-f0-9]{8,}[^"']*strapi/i, evidence: "Strapi uploads", weight: 3 }],
    url: [],
    header: [{ name: "x-powered-by", re: /strapi/i, evidence: "x-powered-by Strapi", weight: 6 }],
  },
  {
    id: "shopify",
    html: [
      {
        re: /cdn\.shopify\.com|myshopify\.com|shopify-section/i,
        evidence: "Shopify assets",
        weight: 5,
      },
    ],
    url: [{ re: /myshopify\.com/i, evidence: "myshopify host", weight: 5 }],
    header: [
      { name: "x-shopify-stage", re: /./, evidence: "x-shopify-stage", weight: 5 },
      { name: "set-cookie", re: /_shopify/i, evidence: "Shopify cookie", weight: 4 },
    ],
  },
  {
    id: "magento",
    html: [
      { re: /mage\/cookies|mage-cache/i, evidence: "Magento cookies/cache", weight: 5 },
      { re: /static\/version\d+\//i, evidence: "Magento static version", weight: 4 },
    ],
    url: [],
    header: [{ name: "x-magento", re: /./, evidence: "x-magento header", weight: 5 }],
  },
  {
    id: "webflow",
    html: [
      { re: /data-wf-site|data-wf-page/i, evidence: "data-wf-site", weight: 6 },
      { re: /website-files\.com|uploads-ssl\.webflow\.com/i, evidence: "Webflow CDN", weight: 5 },
    ],
    url: [],
    header: [],
  },
  {
    id: "optimizely",
    html: [{ re: /episerver|optimizely-cms|epi-util/i, evidence: "Optimizely/Episerver", weight: 5 }],
    url: [{ re: /\/episerver\//i, evidence: "Episerver path", weight: 4 }],
    header: [],
  },
  {
    id: "umbraco",
    html: [{ re: /\/umbraco\//i, evidence: "Umbraco path", weight: 5 }],
    url: [{ re: /\/umbraco\//i, evidence: "Umbraco path", weight: 4 }],
    header: [],
  },
  {
    id: "hubspot",
    html: [
      { re: /hs-sites\.com/i, evidence: "hs-sites.com", weight: 6 },
      {
        re: /name=["']generator["'][^>]*hubspot/i,
        evidence: "generator=HubSpot",
        weight: 6,
      },
    ],
    url: [{ re: /\.hs-sites\.com/i, evidence: "HubSpot CMS host", weight: 4 }],
    header: [{ name: "x-powered-by", re: /hubspot/i, evidence: "x-powered-by HubSpot", weight: 5 }],
  },
  {
    id: "nextjs",
    html: [
      { re: /id=["']__next["']|_next\/static/i, evidence: "Next.js runtime", weight: 4 },
      { re: /__NEXT_DATA__/i, evidence: "__NEXT_DATA__", weight: 5 },
    ],
    url: [{ re: /_next\/static/i, evidence: "/_next/static", weight: 3 }],
    header: [{ name: "x-powered-by", re: /next\.js/i, evidence: "x-powered-by Next.js", weight: 5 }],
  },
  {
    id: "nuxt",
    html: [{ re: /__NUXT__|\/_nuxt\//i, evidence: "Nuxt runtime", weight: 5 }],
    url: [{ re: /\/_nuxt\//i, evidence: "/_nuxt", weight: 3 }],
    header: [],
  },
  {
    id: "sharepoint",
    html: [
      { re: /_layouts\/15|_spPageContextInfo/i, evidence: "SharePoint layouts", weight: 6 },
    ],
    url: [{ re: /_layouts\/15/i, evidence: "SharePoint layouts", weight: 4 }],
    header: [
      {
        name: "microsoftsharepointteamservices",
        re: /./,
        evidence: "SharePoint header",
        weight: 6,
      },
    ],
  },
  {
    id: "squarespace",
    html: [
      {
        re: /static1\.squarespace\.com|squarespace-cdn\.com|sqs-block/i,
        evidence: "Squarespace assets",
        weight: 5,
      },
    ],
    url: [{ re: /squarespace\.com/i, evidence: "Squarespace host", weight: 4 }],
    header: [],
  },
  {
    id: "wix",
    html: [{ re: /static\.wixstatic\.com/i, evidence: "Wix CDN", weight: 5 }],
    url: [{ re: /wixsite\.com/i, evidence: "Wix host", weight: 5 }],
    header: [{ name: "x-wix-request-id", re: /./, evidence: "x-wix-request-id", weight: 5 }],
  },
];

const PAGE_MIN_SCORE = 4;
const HIGH = 10;
const MEDIUM = 6;

export function detectStackOnPage(
  url: string,
  html = "",
  headers: Record<string, string> = {},
): StackHint[] {
  const hits: { id: CmsStackId; evidence: string[]; score: number }[] = [];

  for (const fp of FINGERPRINTS) {
    const evidence: string[] = [];
    let score = 0;
    for (const rule of fp.html) {
      if (html && rule.re.test(html)) {
        evidence.push(rule.evidence);
        score += rule.weight;
      }
    }
    for (const rule of fp.url) {
      if (rule.re.test(url)) {
        evidence.push(rule.evidence);
        score += rule.weight;
      }
    }
    for (const rule of fp.header) {
      const value = headers[rule.name] ?? headers[rule.name.toLowerCase()] ?? "";
      if (value && rule.re.test(value)) {
        evidence.push(rule.evidence);
        score += rule.weight;
      }
    }
    if (score >= PAGE_MIN_SCORE) {
      hits.push({ id: fp.id, evidence: [...new Set(evidence)], score });
    }
  }

  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ id, evidence, score }) => ({ id, evidence, score }));
}

export function emptyStack(): StackDetection {
  return {
    primary: null,
    others: [],
    confidence: "none",
    summary: "No CMS fingerprint in the HTML sample.",
  };
}

export function aggregateStacks(
  pages: { stackHints?: StackHint[] }[],
): StackDetection {
  const byId = new Map<
    CmsStackId,
    { score: number; best: number; evidence: Set<string>; pages: number }
  >();

  for (const page of pages) {
    const seen = new Set<CmsStackId>();
    for (const hint of page.stackHints ?? []) {
      if (hint.id === "unknown") continue;
      const current = byId.get(hint.id) ?? {
        score: 0,
        best: 0,
        evidence: new Set<string>(),
        pages: 0,
      };
      const pageScore = hint.score ?? hint.evidence.length;
      hint.evidence.forEach((item) => current.evidence.add(item));
      current.score += pageScore;
      // Strongest evidence seen on any single page — this, not the running
      // total, decides confidence. See the note on `confidence` below.
      current.best = Math.max(current.best, pageScore);
      if (!seen.has(hint.id)) {
        current.pages += 1;
        seen.add(hint.id);
      }
      byId.set(hint.id, current);
    }
  }

  const ranked: StackEvidence[] = [...byId.entries()]
    .map(([id, value]) => ({
      id,
      label: CMS_STACK_LABELS[id],
      score: value.score,
      evidence: [...value.evidence].slice(0, 6),
      pages: value.pages,
      kind: isFrontendStack(id) ? ("frontend" as const) : ("cms" as const),
    }))
    .sort((a, b) => {
      const cmsDelta = Number(!isFrontendStack(a.id)) - Number(!isFrontendStack(b.id));
      if (cmsDelta !== 0) return cmsDelta > 0 ? -1 : 1;
      return b.score - a.score || b.pages - a.pages;
    });

  const primary = ranked[0] ?? null;
  // Confidence comes from the strongest evidence on a *single* page, not from
  // the total across pages.
  //
  // Summing let repetition manufacture certainty: one weak rule matching a
  // site-wide headline or footer on 12 sampled pages reached "high" on its own.
  // That is how aeminsider.com — a tutorial site whose hero reads "Learn Adobe
  // Experience Manager from the ground up" — was reported as high-confidence
  // AEM, which then fed the mismatch driver into the score. Corroboration
  // across pages still helps, but it can only promote evidence that was already
  // strong enough on its own merits.
  const best = primary ? (byId.get(primary.id)?.best ?? 0) : 0;
  const confidence: StackDetection["confidence"] = !primary
    ? "none"
    : best >= HIGH && primary.pages >= 2
      ? "high"
      : best >= MEDIUM
        ? "medium"
        : "low";

  let summary: string;
  if (!primary) {
    summary =
      "No CMS fingerprint in the HTML sample. Could be a custom stack, heavily cached front end, or a blocked crawl.";
  } else if (isFrontendStack(primary.id)) {
    summary = `${primary.label} frontend (${confidence} confidence; seen on ${primary.pages} sampled page${primary.pages === 1 ? "" : "s"}). Source CMS was not identified — confirm the authoring platform before the SOW.`;
  } else {
    summary = `${primary.label} (${confidence} confidence; seen on ${primary.pages} sampled page${primary.pages === 1 ? "" : "s"} — ${primary.evidence.slice(0, 3).join(", ")})`;
  }

  return {
    primary,
    others: ranked.slice(1, 4),
    confidence,
    summary,
  };
}

export function stackAlignment(
  stackId: CmsStackId | undefined,
  target: "aemaacs-upgrade" | "aem-to-other" | "other-to-aem",
): "match" | "mismatch" | "unknown" {
  if (!stackId || stackId === "unknown" || isFrontendStack(stackId)) return "unknown";
  const isAem = stackId === "aem";
  if (target === "aemaacs-upgrade" || target === "aem-to-other") {
    return isAem ? "match" : "mismatch";
  }
  return isAem ? "mismatch" : "match";
}

export function looksLikeHtml(text: string): boolean {
  const slice = text.slice(0, 2500).toLowerCase();
  return slice.includes("<html") || slice.includes("<!doctype html");
}

export function originHomeUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (/\.xml(\.gz)?$/i.test(url.pathname) || /sitemap/i.test(url.pathname)) {
      return `${url.origin}/`;
    }
    if (!url.pathname.endsWith("/") && !url.pathname.split("/").pop()?.includes(".")) {
      return url.href;
    }
    if (url.pathname === "/" || url.pathname.endsWith("/")) return url.href;
    return `${url.origin}/`;
  } catch {
    return undefined;
  }
}
