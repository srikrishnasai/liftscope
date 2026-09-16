import { Suspense } from "react";
import { EstimateForm } from "@/components/estimate-form";
import { DemoAutostart } from "@/components/demo-autostart";
import { SiteShell } from "@/components/site-shell";

export const metadata = {
  title: "New estimate · LiftScope",
  description:
    "Paste a sitemap, choose a migration target, and generate a LiftScope complexity score.",
};

export default function EstimatePage() {
  return (
    <SiteShell compact>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
          Brief
        </p>
        <h1 className="font-heading mt-2 text-3xl tracking-tight sm:text-4xl">
          New migration estimate
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Public sitemaps or a live homepage. We fingerprint the CMS from HTML
          even when it is not AEM. If fetch fails — blocked host, timeout, or
          invalid XML — you still get a partial estimate from the scale fields.
          Reviewers can skip the live web entirely with the sample path.
        </p>
        <div className="mt-8">
          <Suspense fallback={null}>
            <DemoAutostart />
          </Suspense>
          <EstimateForm />
        </div>
      </main>
    </SiteShell>
  );
}
