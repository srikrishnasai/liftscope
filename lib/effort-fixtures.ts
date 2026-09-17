/**
 * Regression fixtures for the effort model.
 *
 * Run with `npm run test:effort`. Executed by `node --experimental-strip-types`
 * and excluded from the Next tsconfig.
 *
 * These exist because v0.1 was **~8x low** on a real programme and nobody
 * noticed: it predicted 26 person-weeks against an actual of 212, and capped
 * `high` at 120 so it could not express the project at any input at all.
 *
 * The load-bearing assertion is that the one delivered migration we have
 * actuals for falls inside the predicted band. If a future change breaks that,
 * the change is wrong — or there is new calibration data, in which case update
 * the provenance note in `lib/scoring.ts` at the same time.
 */

import { effortFromScore } from "./scoring.ts";
import type { EstimateInput } from "./types.ts";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const pass = actual === expected;
  if (!pass) failures += 1;
  console.log(
    `${pass ? "ok  " : "FAIL"} ${name}${pass ? "" : `  (got ${String(actual)}, want ${String(expected)})`}`,
  );
}

function input(over: Partial<EstimateInput> = {}): EstimateInput {
  return {
    target: "aemaacs-upgrade",
    siteCount: 1,
    languageCount: 1,
    customComponentCount: 0,
    ...over,
  };
}

/* ---- the calibration project ---------------------------------------------
 * AEM 6.5.21 on AMS, 7 repositories, ~10 sites, 4,761 BPA findings
 * (191.6 remediation points), 7 people x 7 months = ~212 person-weeks.
 */
const ACTUAL = 212;

console.log("— calibration project —");
{
  const viaComplexity = effortFromScore(5, input({ siteCount: 10, repoCount: 7, customComponentCount: 530 }));
  check("actual falls inside the band", viaComplexity.low <= ACTUAL && ACTUAL <= viaComplexity.high, true);
  check("mid is within 10% of actual", Math.abs(viaComplexity.mid - ACTUAL) / ACTUAL < 0.1, true);
  check("not flagged as BPA-derived", viaComplexity.fromBpa, false);

  // The same estate priced from its BPA report instead of the complexity curve
  // must land in the same place — the two inputs are calibrated to each other.
  const viaBpa = effortFromScore(5, input({ siteCount: 10, repoCount: 7, bpaPoints: 191.6 }));
  check("BPA path also brackets the actual", viaBpa.low <= ACTUAL && ACTUAL <= viaBpa.high, true);
  check("BPA path is flagged", viaBpa.fromBpa, true);
  check("both paths agree within 5%", Math.abs(viaBpa.mid - viaComplexity.mid) / viaComplexity.mid < 0.05, true);

  // Bucket split should be roughly 30 / 40 / 30.
  const total = viaComplexity.code + viaComplexity.content + viaComplexity.overhead;
  const pct = (n: number) => Math.round((n / total) * 100);
  check("code is ~30%", Math.abs(pct(viaComplexity.code) - 30) <= 5, true);
  check("content is ~40%", Math.abs(pct(viaComplexity.content) - 40) <= 5, true);
  check("overhead is ~30%", Math.abs(pct(viaComplexity.overhead) - 30) <= 5, true);
}

console.log("\n— the v0.1 failures must not come back —");
{
  // v0.1 hard-capped `high` at 120 in two places.
  const huge = effortFromScore(10, input({ siteCount: 40, languageCount: 20, repoCount: 20, customComponentCount: 900 }));
  check("no 120-week ceiling", huge.high > 120, true);
  check("a very large estate exceeds the old cap", huge.mid > 120, true);

  // v0.1 produced 26 mid for the calibration estate. Anything near that is a
  // regression to the single-curve model.
  const calibrated = effortFromScore(5, input({ siteCount: 10, repoCount: 7, customComponentCount: 530 }));
  check("calibration estate is not priced like a marketing site", calibrated.mid > 150, true);
}

console.log("\n— monotonicity —");
{
  const base = effortFromScore(5, input({ siteCount: 2, repoCount: 2 }));
  check("more repositories costs more", effortFromScore(5, input({ siteCount: 2, repoCount: 5 })).mid > base.mid, true);
  check("more sites costs more", effortFromScore(5, input({ siteCount: 8, repoCount: 2 })).mid > base.mid, true);
  check("more locales costs more", effortFromScore(5, input({ siteCount: 2, repoCount: 2, languageCount: 6 })).mid > base.mid, true);
  check("more custom components costs more", effortFromScore(5, input({ siteCount: 2, repoCount: 2, customComponentCount: 400 })).mid > base.mid, true);
  // Complexity deliberately does NOT drive effort: size and difficulty differ.
  check("complexity alone does not move effort", effortFromScore(10, input({ siteCount: 2, repoCount: 2 })).mid, base.mid);
  check("more BPA points costs more", effortFromScore(5, input({ siteCount: 2, repoCount: 2, bpaPoints: 400 })).mid
    > effortFromScore(5, input({ siteCount: 2, repoCount: 2, bpaPoints: 100 })).mid, true);
}

console.log("\n— band and defaults —");
{
  const e = effortFromScore(6, input({ siteCount: 3, repoCount: 2, customComponentCount: 80 }));
  check("low < mid < high", e.low < e.mid && e.mid < e.high, true);
  check("band is wide (one calibration point)", e.high / e.low > 2.5, true);
  check("buckets sum to mid", Math.abs(e.code + e.content + e.overhead - e.mid) <= 1, true);

  // repoCount is optional on older stored reports; must default to 1, not 0.
  const noRepos = effortFromScore(5, input({ siteCount: 1 }));
  const oneRepo = effortFromScore(5, input({ siteCount: 1, repoCount: 1 }));
  check("missing repoCount defaults to one", noRepos.mid, oneRepo.mid);
  check("zero repoCount is floored at one", effortFromScore(5, input({ siteCount: 1, repoCount: 0 })).mid, oneRepo.mid);

  // A small estate must still be plausible, not enterprise-priced.
  const small = effortFromScore(3, input({ customComponentCount: 12 }));
  check("a small estate stays modest", small.mid < 80, true);
  check("but is never trivial", small.mid > 15, true);
}

console.log(
  `\n${failures === 0 ? "All effort fixtures passed." : `${failures} fixture(s) FAILED.`}`,
);
if (failures > 0) process.exit(1);
