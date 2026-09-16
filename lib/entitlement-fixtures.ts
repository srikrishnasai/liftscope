/**
 * Regression fixtures for the free-report entitlement.
 *
 * Run with `npm run test:entitlements`. Executed by
 * `node --experimental-strip-types` and excluded from the Next tsconfig.
 *
 * What these protect: the giveaway must be exactly one report per person, and
 * must not be farmable by moving between anonymous and signed-in. The
 * cookie-tampering cases matter because the visitor id is the only thing
 * standing between "one free report" and "unlimited free reports".
 *
 * No network: runs against the file KV driver in a temp directory.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const workDir = mkdtempSync(path.join(tmpdir(), "liftscope-ent-"));
process.env.LIFTSCOPE_DATA_DIR = workDir;
process.env.AUTH_SECRET = "fixture-secret-value";
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const ent = await import("./entitlements.ts");
const { encodeSession } = await import("./auth.ts");
const { resetKv } = await import("./kv.ts");

let failures = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const pass = actual === expected;
  if (!pass) failures += 1;
  console.log(
    `${pass ? "ok  " : "FAIL"} ${name}${pass ? "" : `  (got ${String(actual)}, want ${String(expected)})`}`,
  );
}

/** A request carrying the given cookies. */
function req(cookies: Record<string, string>): Request {
  const header = Object.entries(cookies)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("; ");
  return new Request("https://liftscope.test/api/reports/x/unlock", {
    headers: header ? { cookie: header } : {},
  });
}

const visitorCookie = (id: string) => ({
  [ent.VISITOR_COOKIE]: ent.encodeVisitor(id),
});

const sessionCookie = (id: string, email: string) => ({
  liftscope_session: encodeSession({ id, email }),
});

console.log("— visitor cookie —");
{
  const id = ent.createVisitorId();
  check("ids are prefixed", id.startsWith("vis_"), true);
  check("round-trips", ent.decodeVisitor(ent.encodeVisitor(id)), id);

  const token = ent.encodeVisitor(id);
  check("tampered id rejected", ent.decodeVisitor(token.replace("vis_", "vis_x")), null);
  check("tampered signature rejected", ent.decodeVisitor(`${id}.deadbeef`), null);
  check("unsigned value rejected", ent.decodeVisitor(id), null);
  check("empty rejected", ent.decodeVisitor(""), null);
  check("undefined rejected", ent.decodeVisitor(undefined), null);

  // The attack: mint your own visitor id to farm free reports.
  check("forged id without a signature rejected", ent.decodeVisitor("vis_deadbeefdeadbeef.x"), null);

  const header = ent.visitorCookieHeader(token);
  check("cookie is httpOnly", header.includes("HttpOnly"), true);
  check("cookie is SameSite=Lax", header.includes("SameSite=Lax"), true);
  check("cookie is path-wide", header.includes("Path=/"), true);
}

console.log("\n— one free report per visitor —");
{
  const vid = ent.createVisitorId();
  const subjects = ent.readSubjects(req(visitorCookie(vid)));
  check("visitor recognised", subjects.visitorId, vid);
  check("anonymous has no user", subjects.user, null);

  check("starts available", (await ent.freeClaimState(subjects, "ls-1")).status, "available");

  await ent.claimFreeReport(subjects, "ls-1");
  check("claimed report reads back as claimed-here", (await ent.freeClaimState(subjects, "ls-1")).status, "claimed-here");

  const other = await ent.freeClaimState(subjects, "ls-2");
  check("A SECOND REPORT IS NOT FREE", other.status, "spent");
  check("remembers which report was claimed", other.status === "spent" && other.reportId, "ls-1");

  // Survives a cold start — the claim is in the store, not in memory.
  resetKv();
  const reloaded = ent.readSubjects(req(visitorCookie(vid)));
  check("CLAIM SURVIVES A COLD START", (await ent.freeClaimState(reloaded, "ls-2")).status, "spent");

  // A different visitor still gets their own.
  const fresh = ent.readSubjects(req(visitorCookie(ent.createVisitorId())));
  check("a different visitor still gets one", (await ent.freeClaimState(fresh, "ls-2")).status, "available");
}

console.log("\n— cannot farm by switching identity —");
{
  // Claim anonymously, then sign up: the visitor cookie still counts.
  const vid = ent.createVisitorId();
  const anon = ent.readSubjects(req(visitorCookie(vid)));
  await ent.claimFreeReport(anon, "ls-anon");

  const afterSignup = ent.readSubjects(
    req({ ...visitorCookie(vid), ...sessionCookie("usr_new", "new@example.com") }),
  );
  check("SIGNING UP AFTER CLAIMING GRANTS NOTHING", (await ent.freeClaimState(afterSignup, "ls-other")).status, "spent");

  // Claim while signed in, then clear cookies: the account still counts.
  const signedIn = ent.readSubjects(
    req({ ...visitorCookie(ent.createVisitorId()), ...sessionCookie("usr_two", "two@example.com") }),
  );
  await ent.claimFreeReport(signedIn, "ls-user");

  const clearedCookies = ent.readSubjects(req(sessionCookie("usr_two", "two@example.com")));
  check("CLEARING COOKIES WHILE SIGNED IN GRANTS NOTHING", (await ent.freeClaimState(clearedCookies, "ls-other")).status, "spent");

  // A brand-new person with neither identity is unaffected by all of the above.
  const stranger = ent.readSubjects(req(visitorCookie(ent.createVisitorId())));
  check("an unrelated visitor is unaffected", (await ent.freeClaimState(stranger, "ls-other")).status, "available");
}

console.log("\n— no identity at all —");
{
  const none = ent.readSubjects(req({}));
  check("no visitor id", none.visitorId, null);
  check("no user", none.user, null);
  check("no identity keys", none.keys.length, 0);
  // With nothing to key on, nothing is found — the route mints a cookie first.
  check("no claim can be found", await ent.findFreeClaim(none), null);
}

console.log("\n— claim is idempotent —");
{
  const subjects = ent.readSubjects(req(visitorCookie(ent.createVisitorId())));
  const first = await ent.claimFreeReport(subjects, "ls-same");
  const second = await ent.claimFreeReport(subjects, "ls-same");
  check("re-claiming the same report is fine", (await ent.freeClaimState(subjects, "ls-same")).status, "claimed-here");
  check("both claims name the same report", first.reportId === second.reportId, true);
}

rmSync(workDir, { recursive: true, force: true });

console.log(
  `\n${failures === 0 ? "All entitlement fixtures passed." : `${failures} fixture(s) FAILED.`}`,
);
if (failures > 0) process.exit(1);
