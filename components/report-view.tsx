"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Layers,
  Lock,
  Printer,
  Share2,
} from "lucide-react";
import { AssumptionOverridesPanel } from "@/components/assumption-overrides";
import { ClientMemo } from "@/components/client-memo";
import { TightenBand } from "@/components/tighten-band";
import { UnlockPanel } from "@/components/unlock-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  clearOverridesLocal,
  clearTightenLocal,
  isUnlockedLocal,
  loadOverridesLocal,
  loadTightenLocal,
  saveOverridesLocal,
  saveTightenLocal,
  setUnlockedLocal,
} from "@/lib/client-store";
import {
  CMS_STACK_LABELS,
  isFrontendStack,
  stackAlignment,
  stackIsActionable,
} from "@/lib/detect-stack";
import {
  confidenceLabel,
  formatCount,
  formatDate,
  formatWeeks,
  severityLabel,
} from "@/lib/format";
import {
  baselineOverrides,
  normalizeOverrides,
  overridesDiffer,
  recomputeReport,
  sensitivityLine,
} from "@/lib/overrides";
import {
  emptyTighten,
  normalizeTighten,
  tightenActive,
} from "@/lib/tighten";
import type {
  AssumptionOverrides,
  EstimateReport,
  Risk,
  StackDetection,
} from "@/lib/types";
import { PAGE_CLASSES, TARGET_LABELS } from "@/lib/types";

const TEASER_COUNT = 2;

export function ReportView({ report }: { report: EstimateReport }) {
  const original = useMemo(() => baselineOverrides(report), [report]);
  const [unlocked, setUnlocked] = useState(
    () => Boolean(report.input.demo) && isUnlockedLocal(report.id),
  );
  const [copied, setCopied] = useState(false);
  const [overrides, setOverrides] = useState<AssumptionOverrides>(original);
  const [overridesReady, setOverridesReady] = useState(false);
  const [tighten, setTighten] = useState(emptyTighten);

  useEffect(() => {
    const stored = loadOverridesLocal(report.id);
    if (stored) setOverrides(normalizeOverrides(stored));
    const storedTighten = loadTightenLocal(report.id);
    if (storedTighten) setTighten(normalizeTighten(storedTighten));
    setOverridesReady(true);
  }, [report.id]);

  useEffect(() => {
    if (!overridesReady) return;
    if (overridesDiffer(overrides, original)) {
      saveOverridesLocal(report.id, overrides);
    } else {
      clearOverridesLocal(report.id);
    }
    if (tightenActive(tighten)) {
      saveTightenLocal(report.id, tighten);
    } else {
      clearTightenLocal(report.id);
    }
  }, [overrides, original, report.id, overridesReady, tighten]);

  const view = useMemo(
    () => recomputeReport(report, overrides, tighten),
    [report, overrides, tighten],
  );
  const dirty = overridesDiffer(overrides, original);
  const tightened = tightenActive(tighten);

  const lockedRisks = useMemo(
    () => view.risks.slice(TEASER_COUNT),
    [view.risks],
  );

  const unlock = useCallback(() => {
    setUnlockedLocal(report.id);
    setUnlocked(true);
  }, [report.id]);

  async function share() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy report URL", url);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
            Migration estimate · rubric {report.rubricVersion}
            {dirty ? " · Adjusted" : ""}
            {tightened ? " · Tightened" : ""}
          </p>
          <h1 className="font-heading text-3xl tracking-tight sm:text-4xl">
            {TARGET_LABELS[view.input.target]}
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(report.createdAt)} · {report.id}
            {report.input.demo ? " · Sample fixture" : ""}
          </p>
          {view.crawl.stack?.primary && (
            <p className="text-sm">
              Source stack:{" "}
              <span className="font-medium">
                {view.crawl.stack.primary.label}
              </span>
              <span className="text-muted-foreground">
                {" "}
                · {confidenceLabel(view.crawl.stack.confidence).toLowerCase()}
              </span>
            </p>
          )}
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={share}>
            {copied ? <Check /> : <Share2 />}
            {copied ? "Link copied" : "Copy link"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!unlocked}
            onClick={() => window.print()}
          >
            <Printer />
            Print / Save PDF
          </Button>
        </div>
      </div>

      {report.crawl.notes.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          <p className="font-medium">Inventory notes</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            {report.crawl.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      <SourceStackCard
        stack={view.crawl.stack}
        target={view.input.target}
      />

      <section className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <ScoreRing score={view.score.complexity} />
        <div className="space-y-3">
          <h2 className="font-heading text-2xl tracking-tight">
            Complexity drivers
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {view.score.narrative}
          </p>
          <ul className="divide-y divide-border">
            {view.score.drivers.map((driver) => (
              <li
                key={driver.id}
                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between"
              >
                <div>
                  <p className="font-medium">{driver.label}</p>
                  <p className="text-sm text-muted-foreground">{driver.detail}</p>
                </div>
                <p className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  +{driver.points.toFixed(1)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="print-break space-y-3">
        <h2 className="font-heading text-2xl tracking-tight">
          Effort band
        </h2>
        <p className="text-sm text-muted-foreground">
          Person-weeks for a senior CMS pod. Ranges, not a single-point bid.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <EffortCard
            label="Low"
            weeks={view.effort.low}
            hint="Assumptions hold; limited surprises"
          />
          <EffortCard
            label="Mid"
            weeks={view.effort.mid}
            hint="Planning case"
            emphasized
          />
          <EffortCard
            label="High"
            weeks={view.effort.high}
            hint="Integrations and content overrun"
          />
        </div>
      </section>

      <AssumptionOverridesPanel
        baseline={original}
        value={overrides}
        onChange={setOverrides}
        sensitivity={sensitivityLine(report, view, dirty || tightened)}
      />

      <TightenBand value={tighten} onChange={setTighten} />

      <section className="print-break space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-heading text-2xl tracking-tight">
              Risk register
            </h2>
            <p className="text-sm text-muted-foreground">
              Ranked from sitemap signals, scale, and target — not a generic
              checklist.
            </p>
          </div>
          {!unlocked && (
            <Badge variant="outline" className="no-print hidden sm:inline-flex">
              <Lock /> Free teaser
            </Badge>
          )}
        </div>
        <div className="space-y-3">
          {view.risks.slice(0, TEASER_COUNT).map((risk) => (
            <RiskCard key={risk.id} risk={risk} />
          ))}
        </div>
        {lockedRisks.length > 0 && !unlocked && (
          <div className="relative">
            <div className="pointer-events-none select-none blur-[6px]">
              {lockedRisks.map((risk) => (
                <RiskCard key={risk.id} risk={risk} />
              ))}
            </div>
            <div className="no-print absolute inset-0 flex items-center justify-center bg-background/55">
              <p className="rounded-md border bg-card px-3 py-1.5 text-sm shadow-sm">
                {lockedRisks.length} additional risks locked
              </p>
            </div>
          </div>
        )}
        {unlocked &&
          lockedRisks.map((risk) => <RiskCard key={risk.id} risk={risk} />)}
      </section>

      {!unlocked && (
        <UnlockPanel
          reportId={report.id}
          demo={Boolean(report.input.demo)}
          onUnlocked={unlock}
        />
      )}

      {unlocked && (
        <>
          <ClientMemo report={view} tighten={tighten} />

          <section className="print-break space-y-4">
            <h2 className="font-heading text-2xl tracking-tight">
              Phased plan
            </h2>
            <ol className="space-y-4">
              {view.plan.map((phase, index) => (
                <li
                  key={phase.id}
                  className="rounded-xl border bg-card p-4 ring-1 ring-foreground/5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-heading text-lg">
                      <span className="mr-2 text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {phase.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {phase.weeks.low}–{phase.weeks.high} person-weeks
                    </p>
                  </div>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {phase.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="print-break space-y-3">
              <h2 className="font-heading text-2xl tracking-tight">
                Assumptions
              </h2>
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {view.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="print-break space-y-3">
              <h2 className="font-heading text-2xl tracking-tight">
                What would change the estimate
              </h2>
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {view.whatWouldChange.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className="print-break space-y-3">
            <h2 className="font-heading text-2xl tracking-tight">
              Sampled pages
            </h2>
            {report.crawl.pages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No pages were sampled. The score used scale inputs
                {report.sitemap.urlCount
                  ? ` and ${formatCount(report.sitemap.urlCount)} sitemap URLs`
                  : ""}
                .
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[42rem] text-left text-sm">
                  <thead className="bg-muted/60 text-xs tracking-wide text-muted-foreground uppercase">
                    <tr>
                      <th className="px-3 py-2 font-medium">Page</th>
                      <th className="px-3 py-2 font-medium">Class</th>
                      <th className="px-3 py-2 font-medium">Stack</th>
                      <th className="px-3 py-2 font-medium">Signals</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.crawl.pages.map((page) => {
                      const hint = page.stackHints?.[0];
                      return (
                      <tr key={page.url} className="border-t">
                        <td className="max-w-xs px-3 py-2">
                          <p className="truncate font-medium">
                            {page.title || page.url}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {page.url}
                          </p>
                        </td>
                        <td className="px-3 py-2 capitalize">{page.pageClass}</td>
                        <td className="px-3 py-2">
                          {hint ? (
                            <span title={hint.evidence.join(", ")}>
                              {CMS_STACK_LABELS[hint.id]}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {page.signals.length ? page.signals.join(", ") : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {page.fetchStatus === "failed"
                            ? page.error || "failed"
                            : page.fetchStatus}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {PAGE_CLASSES.map((cls) => (
                <span key={cls} className="rounded-md bg-muted px-2 py-1">
                  {cls}: {report.crawl.classMix[cls]}
                </span>
              ))}
            </div>
          </section>
        </>
      )}

      <Separator className="no-print" />
      <p className="no-print text-sm text-muted-foreground">
        Need another scenario?{" "}
        <Link href="/estimate" className="text-foreground underline-offset-4 hover:underline">
          Run a new estimate
        </Link>
        .
      </p>
    </div>
  );
}

function SourceStackCard({
  stack,
  target,
}: {
  stack?: StackDetection;
  target: EstimateReport["input"]["target"];
}) {
  const primary = stack?.primary ?? null;
  const alignment = stackAlignment(primary?.id, target);
  const mismatch = stackIsActionable(stack) && alignment === "mismatch";
  const frontend = primary ? isFrontendStack(primary.id) : false;

  return (
    <section className="rounded-xl border bg-card p-5 ring-1 ring-foreground/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Layers className="mt-0.5 size-4 text-muted-foreground" />
          <div>
            <h2 className="font-heading text-xl tracking-tight">
              Detected source stack
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Distinctive asset paths, generator tags, and headers — not
              brand names in copy. Low-confidence hints do not change the
              score.
            </p>
          </div>
        </div>
        <Badge
          variant={
            !primary
              ? "outline"
              : stack?.confidence === "high"
                ? "default"
                : stack?.confidence === "medium"
                  ? "secondary"
                  : "outline"
          }
        >
          {primary ? confidenceLabel(stack?.confidence ?? "none") : "Not identified"}
        </Badge>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-3">
        <p className="font-heading text-2xl tracking-tight">
          {primary ? primary.label : "Unknown / not identified"}
        </p>
        {primary && frontend && (
          <p className="text-sm text-muted-foreground">Frontend, not a CMS</p>
        )}
        {primary && !frontend && primary.id !== "aem" && (
          <p className="text-sm text-muted-foreground">Not AEM</p>
        )}
        {primary && !frontend && !stackIsActionable(stack) && (
          <p className="text-sm text-muted-foreground">Hint only</p>
        )}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {stack?.summary ??
          "No page sample was available to fingerprint the CMS."}
        {mismatch && primary
          ? ` This does not match the selected target (${TARGET_LABELS[target]}). Confirm the live platform before locking the SOW.`
          : ""}
      </p>
      {primary && primary.evidence.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {primary.evidence.map((item) => (
            <span
              key={item}
              className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
            >
              {item}
            </span>
          ))}
        </div>
      )}
      {stack && stack.others.length > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Also seen:{" "}
          {stack.others
            .map((item) => `${item.label} (${item.pages} page${item.pages === 1 ? "" : "s"})`)
            .join(" · ")}
        </p>
      )}
    </section>
  );
}

function ScoreRing({ score }: { score: number }) {
  const radius = 54;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 10) * circ;
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border bg-card p-6 ring-1 ring-foreground/5">
      <svg viewBox="0 0 140 140" className="size-40">
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          className="stroke-muted"
          strokeWidth="8"
        />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          className="stroke-primary"
          strokeWidth="8"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="butt"
          transform="rotate(-90 70 70)"
        />
        <text
          x="70"
          y="78"
          textAnchor="middle"
          className="fill-foreground"
          style={{ fontSize: "42px", fontFamily: "var(--font-heading)" }}
        >
          {score}
        </text>
      </svg>
      <p className="mt-1 text-xs tracking-[0.14em] text-muted-foreground uppercase">
        Complexity / 10
      </p>
    </div>
  );
}

function EffortCard({
  label,
  weeks,
  hint,
  emphasized,
}: {
  label: string;
  weeks: number;
  hint: string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={
        emphasized
          ? "rounded-xl border border-primary/25 bg-card p-4 ring-1 ring-primary/15"
          : "rounded-xl border bg-card p-4 ring-1 ring-foreground/5"
      }
    >
      <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="font-heading mt-2 text-3xl tracking-tight">
        {weeks}
      </p>
      <p className="text-sm text-muted-foreground">{formatWeeks(weeks)}</p>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function RiskCard({ risk }: { risk: Risk }) {
  return (
    <article className="mb-3 rounded-xl border bg-card p-4 ring-1 ring-foreground/5 last:mb-0">
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="size-4 text-muted-foreground" />
        <h3 className="font-medium">{risk.title}</h3>
        <Badge
          variant={risk.severity === "high" ? "destructive" : "secondary"}
        >
          {severityLabel(risk.severity)}
        </Badge>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {risk.explanation}
      </p>
    </article>
  );
}
