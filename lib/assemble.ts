import {
  buildAssumptions,
  buildNarrative,
  buildWhatWouldChange,
} from "./narrative";
import { buildPhasedPlan } from "./plan";
import { buildRiskRegister } from "./risks";
import { effortFromScore, RUBRIC_VERSION, scoreEstimate } from "./scoring";
import type {
  CrawlSummary,
  EstimateInput,
  EstimateReport,
  Risk,
  ScoreAdjustments,
  SitemapSummary,
} from "./types";

export function assembleReport(parts: {
  id: string;
  createdAt: string;
  input: EstimateInput;
  sitemap: SitemapSummary;
  crawl: CrawlSummary;
  extraAssumptions?: string[];
  adjustments?: ScoreAdjustments;
}): EstimateReport {
  const { id, createdAt, input, sitemap, crawl } = parts;
  const adjustments = parts.adjustments;
  const scored = scoreEstimate(input, sitemap, crawl);
  const extraDrivers = (adjustments?.extraDrivers ?? []).filter(
    (driver) => driver.points !== 0,
  );
  const raw = Number(
    (
      scored.raw + extraDrivers.reduce((sum, driver) => sum + driver.points, 0)
    ).toFixed(2),
  );
  const complexity = Math.min(10, Math.max(1, Math.round(raw)));
  const drivers = [...scored.drivers, ...extraDrivers].sort(
    (a, b) => b.points - a.points,
  );
  const baseEffort = effortFromScore(complexity, input);
  const multiplier = adjustments?.effortMultiplier ?? 1;
  const effort = scaleEffort(baseEffort, multiplier);
  const assumptions = [
    ...(parts.extraAssumptions ?? []),
    ...(adjustments?.assumptions ?? []),
    ...buildAssumptions(input, sitemap, crawl),
  ];

  return {
    id,
    createdAt,
    rubricVersion: RUBRIC_VERSION,
    input,
    sitemap,
    crawl,
    score: {
      complexity,
      raw,
      drivers,
      narrative: buildNarrative(
        input,
        sitemap,
        crawl,
        complexity,
        drivers,
        effort,
      ),
    },
    effort,
    risks: mergeRisks(
      buildRiskRegister(input, sitemap, crawl),
      adjustments?.extraRisks ?? [],
    ),
    plan: buildPhasedPlan(input, effort, crawl),
    assumptions,
    whatWouldChange: buildWhatWouldChange(input, sitemap, crawl),
  };
}

function scaleEffort(
  effort: EstimateReport["effort"],
  multiplier: number,
): EstimateReport["effort"] {
  if (multiplier === 1) return effort;
  const low = Math.max(3, Math.round(effort.low * multiplier));
  const mid = Math.max(low + 2, Math.round(effort.mid * multiplier));
  const high = Math.min(120, Math.round(effort.high * multiplier));
  return { low, mid, high };
}

function mergeRisks(base: Risk[], extra: Risk[]): Risk[] {
  const seen = new Set<string>();
  const out: Risk[] = [];
  for (const risk of [...extra, ...base]) {
    if (seen.has(risk.id)) continue;
    seen.add(risk.id);
    out.push(risk);
  }
  return out.slice(0, 8);
}
