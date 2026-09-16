import {
  aggregateStacks,
  detectStackOnPage,
  isFrontendStack,
  stackAlignment,
  stackIsActionable,
} from "./detect-stack.ts";

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

const wp = detectStackOnPage(
  "https://www.example.com/",
  `<html><link href="/wp-content/themes/x/style.css"><link href="/wp-includes/js/wp.js"><meta name="generator" content="WordPress 6.4"></html>`,
);
assert(wp[0]?.id === "wordpress", `wordpress fixture: ${JSON.stringify(wp)}`);

const aem = detectStackOnPage(
  "https://www.example.com/",
  `<link href="/etc.clientlibs/site/clientlib.css"><div class="aem-Grid aem-Grid--12"></div>`,
);
assert(aem[0]?.id === "aem", `aem fixture: ${JSON.stringify(aem)}`);

const lcp = detectStackOnPage(
  "https://www.airbnb.example/",
  `self.perfMetrics.onLargestContentfulPaint=function(e){}; .foo1r4qscq:focus-visible{color:red}`,
);
assert(lcp.length === 0, `LargestContentfulPaint / :focus must not be a CMS: ${JSON.stringify(lcp)}`);

const salesforceOg = detectStackOnPage(
  "https://www.salesforce.com/",
  `<meta property="og:image" content="https://wp.sfdcdigital.com/en-us/wp-content/uploads/sites/4/logo.jpg">`,
);
assert(
  !salesforceOg.some((hit) => hit.id === "wordpress"),
  `og:image /wp-content alone must not be WordPress: ${JSON.stringify(salesforceOg)}`,
);

const hubspotCopy = detectStackOnPage(
  "https://www.notion.so/",
  `<img src="/front-static/agents/tasks/hubspot.svg"><div id="__next"></div><script id="__NEXT_DATA__"></script>`,
);
assert(
  !hubspotCopy.some((hit) => hit.id === "hubspot"),
  `HubSpot logo must not be HubSpot CMS: ${JSON.stringify(hubspotCopy)}`,
);
assert(hubspotCopy[0]?.id === "nextjs", `notion-like page should be Next.js: ${JSON.stringify(hubspotCopy)}`);

const webflowClass = detectStackOnPage(
  "https://www.hubspot.com/",
  `<title>HubSpot</title><style>.wf-page-header{height:10px}</style>`,
);
assert(
  !webflowClass.some((hit) => hit.id === "webflow"),
  `wf-page-header must not be Webflow: ${JSON.stringify(webflowClass)}`,
);

const githubCms = detectStackOnPage(
  "https://github.com/",
  `<meta name="twitter:image" content="https://images.ctfassets.net/abc/GH.jpg">`,
);
assert(githubCms[0]?.id === "contentful", `ctfassets should still be Contentful: ${JSON.stringify(githubCms)}`);

const notionPreconnect = detectStackOnPage(
  "https://www.notion.so/",
  `<link rel="preconnect" href="https://images.ctfassets.net"/><div id="__next"></div><script id="__NEXT_DATA__"></script>`,
);
assert(
  !notionPreconnect.some((hit) => hit.id === "contentful"),
  `preconnect to ctfassets must not be Contentful: ${JSON.stringify(notionPreconnect)}`,
);
assert(notionPreconnect[0]?.id === "nextjs", `notion preconnect page should be Next.js`);

const aggLow = aggregateStacks([{ stackHints: githubCms }]);
assert(aggLow.primary?.id === "contentful", "contentful primary");
assert(aggLow.confidence === "low", `single CDN hit is low confidence, got ${aggLow.confidence}`);
assert(!stackIsActionable(aggLow), "low-confidence Contentful must not change the score");

const demoPages = Array.from({ length: 4 }, () => ({
  stackHints: aem,
}));
const aggAem = aggregateStacks(demoPages);
assert(aggAem.primary?.id === "aem", "aem primary");
assert(stackIsActionable(aggAem), "multi-page AEM should be actionable");
assert(stackAlignment("aem", "aemaacs-upgrade") === "match", "aem matches upgrade");
assert(stackAlignment("wordpress", "aemaacs-upgrade") === "mismatch", "wordpress mismatches upgrade");
assert(stackAlignment("nextjs", "aemaacs-upgrade") === "unknown", "nextjs is not a CMS for alignment");
assert(isFrontendStack("nextjs"), "nextjs is frontend");

console.log("detect-stack fixtures ok");
