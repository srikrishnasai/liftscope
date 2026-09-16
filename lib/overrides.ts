import { assembleReport } from "./assemble";
import { tightenActive, tightenAdjustments } from "./tighten";
import type { TightenAnswers } from "./tighten";
import type {
  AssumptionOverrides,
  EstimateReport,
  IntegrationSignal,
} from "./types";
import { INTEGRATION_SIGNALS } from "./types";

export const SIGNAL_LABELS: Record<IntegrationSignal, string> = {
  analytics: "Analytics tags",
  forms: "Forms / CRM",
  sso: "SSO / identity",
  personalization: "Personalization",
  commerce: "Commerce",
  search: "Search",
};

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function baselineOverrides(report: EstimateReport): AssumptionOverrides {
  return {
    pageCount: report.sitemap.urlCount > 0 ? report.sitemap.urlCount : 200,
    siteCount: report.input.siteCount,
    languageCount: report.input.languageCount,
    customComponentCount: report.input.customComponentCount,
    formHeavyPct: report.crawl.formHeavyPct,
    signals: [...report.crawl.signals],
    target: report.input.target,
  };
}

export function normalizeOverrides(
  raw: AssumptionOverrides,
): AssumptionOverrides {
  const signals = INTEGRATION_SIGNALS.filter((signal) =>
    (raw.signals ?? []).includes(signal),
  );
  return {
    pageCount: clampInt(raw.pageCount, 1, 50_000),
    siteCount: clampInt(raw.siteCount, 1, 200),
    languageCount: clampInt(raw.languageCount, 1, 80),
    customComponentCount: clampInt(raw.customComponentCount, 0, 2000),
    formHeavyPct: clampInt(raw.formHeavyPct, 0, 100),
    signals,
    target: raw.target,
  };
}

export function overridesDiffer(
  a: AssumptionOverrides,
  b: AssumptionOverrides,
): boolean {
  const left = normalizeOverrides(a);
  const right = normalizeOverrides(b);
  if (left.pageCount !== right.pageCount) return true;
  if (left.siteCount !== right.siteCount) return true;
  if (left.languageCount !== right.languageCount) return true;
  if (left.customComponentCount !== right.customComponentCount) return true;
  if (left.formHeavyPct !== right.formHeavyPct) return true;
  if (left.target !== right.target) return true;
  if (left.signals.length !== right.signals.length) return true;
  return left.signals.some((signal, index) => signal !== right.signals[index]);
}

export function recomputeReport(
  report: EstimateReport,
  rawOverrides: AssumptionOverrides,
  tighten?: TightenAnswers,
): EstimateReport {
  const overrides = normalizeOverrides(rawOverrides);
  const baseline = baselineOverrides(report);
  const dirty = overridesDiffer(overrides, baseline);

  const input = {
    ...report.input,
    siteCount: overrides.siteCount,
    languageCount: overrides.languageCount,
    customComponentCount: overrides.customComponentCount,
    target: overrides.target,
  };

  const pageCountChanged = overrides.pageCount !== baseline.pageCount;
  const sitemap = {
    ...report.sitemap,
    urlCount:
      pageCountChanged || report.sitemap.urlCount > 0
        ? overrides.pageCount
        : report.sitemap.urlCount,
    urlCountOverridden: dirty && pageCountChanged,
  };

  const crawl = {
    ...report.crawl,
    formHeavyPct: overrides.formHeavyPct,
    signals: overrides.signals,
    formHeavyOverridden:
      dirty && overrides.formHeavyPct !== baseline.formHeavyPct,
    signalsOverridden:
      dirty &&
      (overrides.signals.length !== baseline.signals.length ||
        overrides.signals.some((signal, i) => signal !== baseline.signals[i])),
  };

  const extras: string[] = [];
  if (dirty) {
    extras.push(
      "Reviewer overrode one or more inventory assumptions. Score and bands below reflect the adjusted case, not the original crawl alone.",
    );
  }

  return assembleReport({
    id: report.id,
    createdAt: report.createdAt,
    input,
    sitemap,
    crawl,
    extraAssumptions: extras.length ? extras : undefined,
    adjustments:
      tighten && tightenActive(tighten)
        ? tightenAdjustments(tighten)
        : undefined,
  });
}

function signed(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
}

export function sensitivityLine(
  baseline: EstimateReport,
  current: EstimateReport,
  dirty = true,
): string {
  const dScore = current.score.complexity - baseline.score.complexity;
  const dMid = current.effort.mid - baseline.effort.mid;
  const dLow = current.effort.low - baseline.effort.low;
  const dHigh = current.effort.high - baseline.effort.high;

  if (!dirty) {
    return "Assumptions match the original analysis. Change a value to see the band move.";
  }

  if (dScore === 0 && dMid === 0 && dLow === 0 && dHigh === 0) {
    return "Overrides are applied, but they stay inside the same scoring bands — complexity and person-weeks are unchanged. Cross a threshold (for example 101 custom components, or another locale) to move the estimate.";
  }

  const scoreBit =
    dScore === 0
      ? `Complexity stays ${current.score.complexity}/10`
      : `Complexity ${baseline.score.complexity} → ${current.score.complexity} (${signed(dScore)})`;
  const midBit =
    dMid === 0
      ? `mid-case stays ${current.effort.mid} person-weeks`
      : `mid-case ${baseline.effort.mid} → ${current.effort.mid} person-weeks (${signed(dMid)})`;

  return `${scoreBit}; ${midBit}. Full band ${current.effort.low}–${current.effort.high} (was ${baseline.effort.low}–${baseline.effort.high}).`;
}
