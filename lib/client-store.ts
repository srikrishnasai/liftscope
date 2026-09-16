import type { TightenAnswers } from "./tighten";
import type { AssumptionOverrides, EstimateReport } from "./types";

const REPORTS_KEY = "liftscope.reports.v1";
const UNLOCK_PREFIX = "liftscope.unlock.";
const OVERRIDE_PREFIX = "liftscope.overrides.";
const TIGHTEN_PREFIX = "liftscope.tighten.";

function readAll(): Record<string, EstimateReport> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(REPORTS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, EstimateReport>;
  } catch {
    return {};
  }
}

export function saveReportLocal(report: EstimateReport): void {
  const all = readAll();
  all[report.id] = report;
  window.localStorage.setItem(REPORTS_KEY, JSON.stringify(all));
}

export function loadReportLocal(id: string): EstimateReport | null {
  return readAll()[id] ?? null;
}

export function setUnlockedLocal(id: string): void {
  window.localStorage.setItem(`${UNLOCK_PREFIX}${id}`, "1");
}

export function isUnlockedLocal(id: string): boolean {
  return window.localStorage.getItem(`${UNLOCK_PREFIX}${id}`) === "1";
}

export function saveOverridesLocal(
  id: string,
  overrides: AssumptionOverrides,
): void {
  window.localStorage.setItem(
    `${OVERRIDE_PREFIX}${id}`,
    JSON.stringify(overrides),
  );
}

export function loadOverridesLocal(id: string): AssumptionOverrides | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${OVERRIDE_PREFIX}${id}`);
    if (!raw) return null;
    return JSON.parse(raw) as AssumptionOverrides;
  } catch {
    return null;
  }
}

export function clearOverridesLocal(id: string): void {
  window.localStorage.removeItem(`${OVERRIDE_PREFIX}${id}`);
}

export function saveTightenLocal(id: string, answers: TightenAnswers): void {
  window.localStorage.setItem(`${TIGHTEN_PREFIX}${id}`, JSON.stringify(answers));
}

export function loadTightenLocal(id: string): TightenAnswers | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${TIGHTEN_PREFIX}${id}`);
    if (!raw) return null;
    return JSON.parse(raw) as TightenAnswers;
  } catch {
    return null;
  }
}

export function clearTightenLocal(id: string): void {
  window.localStorage.removeItem(`${TIGHTEN_PREFIX}${id}`);
}
