import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    n: "01",
    title: "Inventory the estate",
    body: "Paste a sitemap URL, a homepage, or upload XML. We fingerprint the CMS from HTML even when it is not AEM.",
  },
  {
    n: "02",
    title: "Name the target and scale",
    body: "AEMaaCS upgrade, leave AEM, or land on AEM — plus sites, locales, and custom component count.",
  },
  {
    n: "03",
    title: "Score against a published rubric",
    body: "Complexity 1–10 from page count, languages, sites, components, form-heavy mix, integration smells, and target. No model API.",
  },
  {
    n: "04",
    title: "Tighten what the sitemap cannot see",
    body: "Override counts if you know better, then answer a short discovery brief — components, forms, SSO, personalization, locales — to move the band.",
  },
  {
    n: "05",
    title: "Unlock the working papers",
    body: "Risk register, phased plan, a client memo, and what would move the band. Sign in, then pay by UPI or card, when payments are on.",
  },
];

const OUTPUTS = [
  {
    title: "Source stack",
    body: "WordPress, Drupal, Sitecore, Shopify, headless, AEM, and others — so an AEM upgrade brief on a WordPress estate is caught before the SOW.",
  },
  {
    title: "Complexity score",
    body: "A 1–10 figure with explicit drivers — so a partner can defend the number in a scoping call.",
  },
  {
    title: "Effort bands",
    body: "Low / mid / high person-weeks. Ranges on purpose. Single-point estimates are theater.",
  },
  {
    title: "Risk register",
    body: "About eight risks, ranked from what we actually saw: SSO, forms, personalization, MSM, SEO, DAM.",
  },
  {
    title: "Phased plan",
    body: "Discovery → pilot → bulk → cutover → hypercare, with week ranges tied to the band.",
  },
  {
    title: "Assumption overrides",
    body: "Change page count, components, form mix, or integrations and watch score and mid-case weeks move — no re-crawl.",
  },
  {
    title: "Tighten the band",
    body: "A short questionnaire for facts a crawl cannot see. Answers add drivers and can stretch the person-week range.",
  },
  {
    title: "Client memo",
    body: "A one-page write-up of the current numbers. Optional AI polish may rephrase only — the rubric still owns the score.",
  },
];

export default function HomePage() {
  return (
    <SiteShell>
      <main className="flex-1">
        <section className="border-b border-border/80">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:py-24">
            <div>
              <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
                CMS / AEM migration estimator
              </p>
              <h1 className="font-heading mt-4 text-4xl leading-[1.1] tracking-tight sm:text-5xl">
                Get a credible AEM/CMS migration estimate in 10 minutes
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
                LiftScope turns a sitemap or homepage URL and a short brief
                into a complexity score, detected source stack, effort band,
                and risk register you can take into a scoping conversation.
                Built for agencies and enterprise CMS teams — not a novelty
                calculator.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/estimate" className={cn(buttonVariants({ size: "lg" }))}>
                  Start estimate
                </Link>
                <Link
                  href="/estimate?demo=1"
                  className={cn(buttonVariants({ size: "lg", variant: "outline" }))}
                >
                  Try sample estimate
                </Link>
              </div>
            </div>
            <aside className="rounded-xl border bg-card p-6 ring-1 ring-foreground/5">
              <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
                Rubric v1.0
              </p>
              <dl className="mt-5 space-y-4 text-sm">
                <div className="flex justify-between gap-4 border-b border-border/70 pb-3">
                  <dt className="text-muted-foreground">Inputs</dt>
                  <dd className="text-right">Sitemap, scale, target</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-border/70 pb-3">
                  <dt className="text-muted-foreground">Page sample</dt>
                  <dd className="text-right">Up to 12 URLs, 8s timeout</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-border/70 pb-3">
                  <dt className="text-muted-foreground">Source stack</dt>
                  <dd className="text-right">HTML fingerprints</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-border/70 pb-3">
                  <dt className="text-muted-foreground">Score</dt>
                  <dd className="text-right">Deterministic 1–10</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Free teaser</dt>
                  <dd className="text-right">Score + two risks · UPI/card</dd>
                </div>
              </dl>
            </aside>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="font-heading text-3xl tracking-tight">How it works</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Four steps. No AEM login, no package upload, no model key.
            </p>
            <ol className="mt-10 grid gap-6 sm:grid-cols-2">
              {STEPS.map((step) => (
                <li key={step.n} className="rounded-xl border bg-card p-5 ring-1 ring-foreground/5">
                  <p className="text-xs tracking-[0.16em] text-muted-foreground">
                    {step.n}
                  </p>
                  <h3 className="font-heading mt-2 text-xl">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-border/80 bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="font-heading text-3xl tracking-tight">What you leave with</h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {OUTPUTS.map((item) => (
                <div key={item.title}>
                  <h3 className="font-medium">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
