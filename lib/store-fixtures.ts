/**
 * Regression fixtures for durable storage.
 *
 * Run with `npm run test:store`. Executed by `node --experimental-strip-types`
 * and excluded from the Next tsconfig — do not import it from app code.
 *
 * The bug these exist to prevent: reports lived in a per-process Map and
 * accounts in a JSON file under /tmp on Vercel. A user could pay through
 * Stripe and land on a report the server no longer had, with no record they
 * had bought anything. The load-bearing assertion here is
 * "survives a simulated cold start".
 *
 * These run against the **file** driver. Upstash is not exercised offline;
 * both adapters implement the same `KvDriver` interface.
 */

import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const workDir = mkdtempSync(path.join(tmpdir(), "liftscope-store-"));
process.env.LIFTSCOPE_DATA_DIR = workDir;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const { kv, resetKv, isDurableStoreConfigured } = await import("./kv.ts");
const accounts = await import("./accounts.ts");
const store = await import("./store.ts");

let failures = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const pass = actual === expected;
  if (!pass) failures += 1;
  console.log(
    `${pass ? "ok  " : "FAIL"} ${name}${pass ? "" : `  (got ${String(actual)}, want ${String(expected)})`}`,
  );
}

/** Drop every in-process cache, so the next read comes off disk. */
function coldStart(): void {
  resetKv();
  accounts.resetLegacyImport();
}

const report = (id: string) =>
  ({
    id,
    createdAt: new Date().toISOString(),
    rubricVersion: "1.0",
    input: { target: "other-to-aem", siteCount: 1, languageCount: 1, customComponentCount: 5 },
    sitemap: { source: "url", urlCount: 42, sitemapIndex: false, childSitemapsFetched: 0, sampleUrls: [] },
    crawl: { attempted: 0, succeeded: 0, failed: 0, pages: [], degraded: true, notes: [], classMix: {}, signals: [], formHeavyPct: 0 },
    score: { complexity: 5, raw: 5, drivers: [], narrative: "" },
    effort: { low: 9, mid: 15, high: 23 },
    risks: [],
    plan: [],
    assumptions: [],
    whatWouldChange: [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

async function driverCases(): Promise<void> {
  console.log("— kv driver —");
  check("defaults to the file driver", kv().name, "file");
  check("durable store not configured", isDurableStoreConfigured(), false);

  await kv().set("k:plain", { hello: "world" });
  check("round-trips an object", (await kv().get<{ hello: string }>("k:plain"))?.hello, "world");
  check("missing key is null", await kv().get("k:absent"), null);

  await kv().del("k:plain");
  check("del removes", await kv().get("k:plain"), null);

  await kv().sadd("k:set", "a");
  await kv().sadd("k:set", "b");
  await kv().sadd("k:set", "a");
  check("set dedupes", (await kv().smembers("k:set")).length, 2);
  await kv().srem("k:set", "a");
  check("srem removes", (await kv().smembers("k:set")).join(","), "b");

  // TTL
  await kv().set("k:ttl", "gone", 1);
  check("ttl value present before expiry", await kv().get("k:ttl"), "gone");
  await new Promise((r) => setTimeout(r, 1100));
  check("ttl value gone after expiry", await kv().get("k:ttl"), null);

  // Persistence across a cold start.
  await kv().set("k:durable", "survives");
  coldStart();
  check("value survives a cold start", await kv().get("k:durable"), "survives");
}

async function reportCases(): Promise<void> {
  console.log("\n— reports —");
  await store.saveReport(report("ls-aaa"));
  check("report read back", (await store.getReport("ls-aaa"))?.id, "ls-aaa");
  check("missing report undefined", await store.getReport("ls-nope"), undefined);

  coldStart();
  check("REPORT SURVIVES COLD START", (await store.getReport("ls-aaa"))?.id, "ls-aaa");

  check("not unlocked by default", await store.isReportUnlocked("ls-aaa"), false);
  await store.markReportUnlocked("ls-aaa", "demo");
  coldStart();
  check("UNLOCK FLAG SURVIVES COLD START", await store.isReportUnlocked("ls-aaa"), true);
}

async function accountCases(): Promise<void> {
  console.log("\n— accounts —");
  const created = await accounts.createAccount("Buyer@Example.COM", "correct-horse");
  check("email normalized", created.email, "buyer@example.com");

  check("found by email", (await accounts.findAccountByEmail("buyer@example.com"))?.id, created.id);
  check("found by email, any case", (await accounts.findAccountByEmail("BUYER@example.com"))?.id, created.id);
  check("found by id", (await accounts.findAccountById(created.id))?.email, "buyer@example.com");

  let duplicate = false;
  try {
    await accounts.createAccount("buyer@example.com", "another-pass");
  } catch {
    duplicate = true;
  }
  check("duplicate email rejected", duplicate, true);

  check("password verifies", await accounts.verifyPassword(created, "correct-horse"), true);
  check("wrong password rejected", await accounts.verifyPassword(created, "nope"), false);
  check("decoy compare always false", await accounts.burnPasswordCompare("anything"), false);

  coldStart();
  check("ACCOUNT SURVIVES COLD START", (await accounts.findAccountById(created.id))?.email, "buyer@example.com");
}

async function unlockCases(): Promise<void> {
  console.log("\n— paid unlocks (the regression) —");
  const user = await accounts.findAccountByEmail("buyer@example.com");
  if (!user) {
    failures += 1;
    console.log("FAIL could not load the test account");
    return;
  }

  check("no unlock yet", await accounts.userHasUnlock(user.id, "ls-paid"), false);
  await accounts.recordUnlock(user.id, "ls-paid", "stripe");
  check("unlock recorded", await accounts.userHasUnlock(user.id, "ls-paid"), true);

  coldStart();
  check("PAID UNLOCK SURVIVES COLD START", await accounts.userHasUnlock(user.id, "ls-paid"), true);

  // Recording twice must not duplicate the row.
  await accounts.recordUnlock(user.id, "ls-paid", "stripe");
  check("recording twice is idempotent", (await accounts.listUnlocksForUser(user.id)).length, 1);

  await accounts.recordUnlock(user.id, "ls-second", "demo");
  const listed = await accounts.listUnlocksForUser(user.id);
  check("lists both unlocks", listed.length, 2);
  check("unlock is scoped to the user", await accounts.userHasUnlock("someone-else", "ls-paid"), false);
}

async function mutationCases(): Promise<void> {
  console.log("\n— account mutation —");
  const user = await accounts.findAccountByEmail("buyer@example.com");
  if (!user) {
    failures += 1;
    console.log("FAIL could not load the test account");
    return;
  }

  await accounts.updateDisplayName(user.id, "  Dana Buyer  ");
  check("display name trimmed", (await accounts.findAccountById(user.id))?.name, "Dana Buyer");

  await accounts.updateEmail(user.id, "moved@example.com", "correct-horse");
  coldStart();
  check("new email resolves", (await accounts.findAccountByEmail("moved@example.com"))?.id, user.id);
  check("old email key dropped", await accounts.findAccountByEmail("buyer@example.com"), undefined);
  check("id index follows the email", (await accounts.findAccountById(user.id))?.email, "moved@example.com");
  check("UNLOCKS SURVIVE AN EMAIL CHANGE", await accounts.userHasUnlock(user.id, "ls-paid"), true);

  let wrongPassword = false;
  try {
    await accounts.updateEmail(user.id, "other@example.com", "not-the-password");
  } catch {
    wrongPassword = true;
  }
  check("email change needs the password", wrongPassword, true);

  await accounts.changePassword(user.id, "correct-horse", "brand-new-pass");
  coldStart();
  const reloaded = await accounts.findAccountById(user.id);
  check("new password verifies", await accounts.verifyPassword(reloaded!, "brand-new-pass"), true);
  check("old password rejected", await accounts.verifyPassword(reloaded!, "correct-horse"), false);

  await accounts.deleteAccount(user.id, "brand-new-pass");
  coldStart();
  check("account deleted", await accounts.findAccountById(user.id), undefined);
  check("delete clears unlocks", await accounts.userHasUnlock(user.id, "ls-paid"), false);
  check("delete clears the unlock set", (await accounts.listUnlocksForUser(user.id)).length, 0);
}

async function legacyCases(): Promise<void> {
  console.log("\n— legacy accounts.json import —");
  const legacyDir = mkdtempSync(path.join(tmpdir(), "liftscope-legacy-"));
  process.env.LIFTSCOPE_DATA_DIR = legacyDir;
  coldStart();

  const legacyPath = path.join(legacyDir, "accounts.json");
  writeFileSync(
    legacyPath,
    JSON.stringify({
      users: [
        {
          id: "u-legacy",
          email: "old@example.com",
          name: "Old User",
          passwordHash: "$2b$10$abcdefghijklmnopqrstuv",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      unlocks: [
        { userId: "u-legacy", reportId: "ls-old", source: "stripe", at: "2026-01-02T00:00:00.000Z" },
      ],
    }),
    "utf8",
  );

  check("legacy user imported", (await accounts.findAccountByEmail("old@example.com"))?.id, "u-legacy");
  check("LEGACY PAID UNLOCK IMPORTED", await accounts.userHasUnlock("u-legacy", "ls-old"), true);
  check("legacy file renamed aside", existsSync(legacyPath), false);
  check("legacy file kept as .migrated", existsSync(`${legacyPath}.migrated`), true);

  coldStart();
  check("imported data survives a cold start", (await accounts.findAccountById("u-legacy"))?.email, "old@example.com");

  rmSync(legacyDir, { recursive: true, force: true });
}

try {
  await driverCases();
  await reportCases();
  await accountCases();
  await unlockCases();
  await mutationCases();
  await legacyCases();
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

console.log(
  `\n${failures === 0 ? "All store fixtures passed." : `${failures} fixture(s) FAILED.`}`,
);
if (failures > 0) process.exit(1);
