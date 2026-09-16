import { kv } from "./kv.ts";
import type { EstimateReport, UnlockSource } from "./types";

/**
 * Report storage.
 *
 * Reports used to live in a per-process `Map`, which meant a cold start or a
 * second serverless instance returned "Report is not in server memory" at the
 * exact moment a user clicked pay. They now go through the KV driver.
 */

/** Long enough to pay for a report, share the link, and come back to it. */
export const REPORT_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Unlock flags for the free paths (demo fixture, or no payment gateway configured). */
const UNLOCK_TTL_SECONDS = REPORT_TTL_SECONDS;

function reportKey(id: string): string {
  return `report:${id}`;
}

function unlockKey(id: string): string {
  return `reportunlock:${id}`;
}

export async function saveReport(report: EstimateReport): Promise<void> {
  await kv().set(reportKey(report.id), report, REPORT_TTL_SECONDS);
}

export async function getReport(id: string): Promise<EstimateReport | undefined> {
  const report = await kv().get<EstimateReport>(reportKey(id));
  return report ?? undefined;
}

export async function markReportUnlocked(
  id: string,
  source: UnlockSource,
): Promise<void> {
  await kv().set(
    unlockKey(id),
    { source, at: new Date().toISOString() },
    UNLOCK_TTL_SECONDS,
  );
}

export async function isReportUnlocked(id: string): Promise<boolean> {
  return (await kv().get(unlockKey(id))) !== null;
}
