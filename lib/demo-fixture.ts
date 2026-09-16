import type { EstimateInput, PageClassification } from "./types";

export const DEMO_INPUT: EstimateInput = {
  target: "aem-to-other",
  siteCount: 3,
  languageCount: 4,
  customComponentCount: 48,
  demo: true,
  sitemapUrl: "https://www.northline.example/sitemap.xml",
  samplePageUrls: [
    "https://www.northline.example/",
    "https://www.northline.example/insights/rate-cycle-briefing",
    "https://www.northline.example/wealth/managed-portfolios",
    "https://www.northline.example/contact/advisor",
    "https://careers.northline.example/apply",
  ],
};

export const DEMO_SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.northline.example/</loc></url>
  <url><loc>https://www.northline.example/en/</loc></url>
  <url><loc>https://www.northline.example/fr/</loc></url>
  <url><loc>https://www.northline.example/de/</loc></url>
  <url><loc>https://www.northline.example/es/</loc></url>
  <url><loc>https://www.northline.example/about/</loc></url>
  <url><loc>https://www.northline.example/about/leadership/</loc></url>
  <url><loc>https://www.northline.example/about/history/</loc></url>
  <url><loc>https://www.northline.example/about/governance/</loc></url>
  <url><loc>https://www.northline.example/wealth/</loc></url>
  <url><loc>https://www.northline.example/wealth/managed-portfolios/</loc></url>
  <url><loc>https://www.northline.example/wealth/private-credit/</loc></url>
  <url><loc>https://www.northline.example/wealth/tax-aware/</loc></url>
  <url><loc>https://www.northline.example/wealth/trust-services/</loc></url>
  <url><loc>https://www.northline.example/insights/</loc></url>
  <url><loc>https://www.northline.example/insights/rate-cycle-briefing/</loc></url>
  <url><loc>https://www.northline.example/insights/family-office-ops/</loc></url>
  <url><loc>https://www.northline.example/insights/municipal-outlook/</loc></url>
  <url><loc>https://www.northline.example/insights/esg-reporting/</loc></url>
  <url><loc>https://www.northline.example/insights/succession-planning/</loc></url>
  <url><loc>https://www.northline.example/campaigns/midyear-review/</loc></url>
  <url><loc>https://www.northline.example/campaigns/private-markets/</loc></url>
  <url><loc>https://www.northline.example/contact/</loc></url>
  <url><loc>https://www.northline.example/contact/advisor/</loc></url>
  <url><loc>https://www.northline.example/contact/media/</loc></url>
  <url><loc>https://investors.northline.example/</loc></url>
  <url><loc>https://investors.northline.example/filings/</loc></url>
  <url><loc>https://investors.northline.example/events/</loc></url>
  <url><loc>https://investors.northline.example/governance/</loc></url>
  <url><loc>https://investors.northline.example/stock/</loc></url>
  <url><loc>https://careers.northline.example/</loc></url>
  <url><loc>https://careers.northline.example/teams/</loc></url>
  <url><loc>https://careers.northline.example/locations/</loc></url>
  <url><loc>https://careers.northline.example/apply/</loc></url>
  <url><loc>https://www.northline.example/legal/privacy/</loc></url>
  <url><loc>https://www.northline.example/legal/terms/</loc></url>
  <url><loc>https://www.northline.example/legal/disclosures/</loc></url>
  <url><loc>https://www.northline.example/search/</loc></url>
</urlset>`;

function page(
  url: string,
  pageClass: PageClassification["pageClass"],
  signals: PageClassification["signals"],
  title: string,
): PageClassification {
  return {
    url,
    pageClass,
    signals,
    title,
    fetchStatus: "fixture",
    stackHints: [
      {
        id: "aem",
        evidence: ["/etc.clientlibs", "/content/dam", "AEM/Granite markers"],
      },
    ],
  };
}

export const DEMO_PAGES: PageClassification[] = [
  page(
    "https://www.northline.example/",
    "landing",
    ["analytics", "personalization", "search"],
    "Northline Financial | Private wealth, clearly run",
  ),
  page(
    "https://www.northline.example/wealth/managed-portfolios/",
    "product",
    ["analytics", "personalization"],
    "Managed portfolios | Northline Wealth",
  ),
  page(
    "https://www.northline.example/wealth/private-credit/",
    "product",
    ["analytics"],
    "Private credit | Northline Wealth",
  ),
  page(
    "https://www.northline.example/insights/rate-cycle-briefing/",
    "article",
    ["analytics"],
    "Rate-cycle briefing | Northline Insights",
  ),
  page(
    "https://www.northline.example/insights/family-office-ops/",
    "article",
    ["analytics"],
    "Family office operations | Northline Insights",
  ),
  page(
    "https://www.northline.example/campaigns/private-markets/",
    "landing",
    ["analytics", "personalization", "forms"],
    "Private markets desk | Northline",
  ),
  page(
    "https://www.northline.example/contact/advisor/",
    "form-heavy",
    ["analytics", "forms"],
    "Speak with an advisor | Northline",
  ),
  page(
    "https://careers.northline.example/apply/",
    "form-heavy",
    ["analytics", "forms", "sso"],
    "Apply | Northline Careers",
  ),
  page(
    "https://investors.northline.example/filings/",
    "other",
    ["analytics", "search"],
    "SEC filings | Northline Investors",
  ),
  page(
    "https://www.northline.example/search/",
    "other",
    ["analytics", "search"],
    "Search | Northline",
  ),
];
