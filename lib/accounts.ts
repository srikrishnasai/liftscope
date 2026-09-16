import { existsSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { createUserId, normalizeEmail } from "./auth.ts";
import { dataDir, kv } from "./kv.ts";

/**
 * Accounts and paid unlocks.
 *
 * Previously a single `data/accounts.json`, which on Vercel lives under `/tmp`
 * — so a user could pay, the instance could recycle, and the record that they
 * had bought anything was gone. Storage now goes through the KV driver
 * (`lib/kv.ts`), which is Upstash in production and a local JSON file in dev.
 *
 * Key layout:
 *   user:<normalized-email>  -> Account          (lookup by email)
 *   userid:<id>              -> normalized email (lookup by id)
 *   unlock:<userId>:<reportId> -> AccountUnlock
 *   unlocks:<userId>         -> set of reportIds
 */

export interface Account {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

export interface AccountUnlock {
  userId: string;
  reportId: string;
  source: "stripe" | "demo";
  at: string;
}

const userKey = (email: string) => `user:${email}`;
const userIdKey = (id: string) => `userid:${id}`;
const unlockKey = (userId: string, reportId: string) =>
  `unlock:${userId}:${reportId}`;
const unlockSetKey = (userId: string) => `unlocks:${userId}`;

/* --------------------------------------------------------------- legacy -- */

interface LegacyFile {
  users: Account[];
  unlocks: AccountUnlock[];
}

let legacyImport: Promise<void> | null = null;

/**
 * One-time import of a pre-KV `data/accounts.json`.
 *
 * Only runs against the local file driver — on Upstash there is nothing to
 * migrate, and reading a stale local file there would resurrect deleted users.
 * The old file is renamed rather than deleted so it stays recoverable.
 *
 * The promise is memoized rather than a boolean flag: concurrent callers must
 * await the *same* import, or the second one reads a half-migrated store.
 */
function importLegacyAccounts(): Promise<void> {
  if (!legacyImport) legacyImport = runLegacyImport();
  return legacyImport;
}

/** Test seam — lets a fixture point at a fresh data dir. */
export function resetLegacyImport(): void {
  legacyImport = null;
}

async function runLegacyImport(): Promise<void> {
  if (kv().name !== "file") return;

  const legacyPath = path.join(dataDir(), "accounts.json");
  if (!existsSync(legacyPath)) return;

  let parsed: LegacyFile;
  try {
    parsed = JSON.parse(readFileSync(legacyPath, "utf8")) as LegacyFile;
  } catch {
    return;
  }

  for (const user of parsed.users ?? []) {
    if (!user?.email || !user.id) continue;
    const email = normalizeEmail(user.email);
    if (await kv().get<Account>(userKey(email))) continue;
    const account: Account = { ...user, email, name: user.name ?? "" };
    await kv().set(userKey(email), account);
    await kv().set(userIdKey(user.id), email);
  }

  for (const row of parsed.unlocks ?? []) {
    if (!row?.userId || !row.reportId) continue;
    await kv().set(unlockKey(row.userId, row.reportId), row);
    await kv().sadd(unlockSetKey(row.userId), row.reportId);
  }

  try {
    renameSync(legacyPath, `${legacyPath}.migrated`);
  } catch {
    // Leaving the original in place is harmless — the guard above is idempotent.
  }
}

/* -------------------------------------------------------------- accounts -- */

export async function findAccountByEmail(
  email: string,
): Promise<Account | undefined> {
  await importLegacyAccounts();
  const account = await kv().get<Account>(userKey(normalizeEmail(email)));
  return account ?? undefined;
}

export async function findAccountById(id: string): Promise<Account | undefined> {
  await importLegacyAccounts();
  const email = await kv().get<string>(userIdKey(id));
  if (!email) return undefined;
  const account = await kv().get<Account>(userKey(email));
  return account ?? undefined;
}

export async function createAccount(
  email: string,
  password: string,
): Promise<Account> {
  await importLegacyAccounts();
  const normalized = normalizeEmail(email);
  if (await kv().get<Account>(userKey(normalized))) {
    throw new Error("An account with that email already exists.");
  }

  const account: Account = {
    id: createUserId(),
    email: normalized,
    name: "",
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: new Date().toISOString(),
  };

  await kv().set(userKey(normalized), account);
  await kv().set(userIdKey(account.id), normalized);
  return account;
}

export async function verifyPassword(
  account: Account,
  password: string,
): Promise<boolean> {
  return bcrypt.compare(password, account.passwordHash);
}

/**
 * A real bcrypt compare against a throwaway hash at the same cost factor, so a
 * sign-in attempt for an unknown email takes about as long as one for a known
 * email. Always resolves false.
 */
const DECOY_HASH = bcrypt.hashSync("liftscope-decoy", 10);

export async function burnPasswordCompare(password: string): Promise<boolean> {
  await bcrypt.compare(password, DECOY_HASH);
  return false;
}

export function publicAccount(account: Account) {
  return {
    id: account.id,
    email: account.email,
    name: account.name ?? "",
    createdAt: account.createdAt,
  };
}

/* --------------------------------------------------------------- unlocks -- */

export async function recordUnlock(
  userId: string,
  reportId: string,
  source: "stripe" | "demo" = "stripe",
): Promise<void> {
  const existing = await kv().get<AccountUnlock>(unlockKey(userId, reportId));
  if (existing) return;
  const row: AccountUnlock = {
    userId,
    reportId,
    source,
    at: new Date().toISOString(),
  };
  await kv().set(unlockKey(userId, reportId), row);
  await kv().sadd(unlockSetKey(userId), reportId);
}

export async function userHasUnlock(
  userId: string,
  reportId: string,
): Promise<boolean> {
  await importLegacyAccounts();
  return (await kv().get(unlockKey(userId, reportId))) !== null;
}

export async function listUnlocksForUser(
  userId: string,
): Promise<AccountUnlock[]> {
  await importLegacyAccounts();
  const reportIds = await kv().smembers(unlockSetKey(userId));
  const rows = await Promise.all(
    reportIds.map((reportId) => kv().get<AccountUnlock>(unlockKey(userId, reportId))),
  );
  return rows
    .filter((row): row is AccountUnlock => row !== null)
    .sort((a, b) => b.at.localeCompare(a.at));
}

/* -------------------------------------------------------------- mutation -- */

async function requireAccount(userId: string): Promise<Account> {
  const account = await findAccountById(userId);
  if (!account) throw new Error("Account not found.");
  return account;
}

export async function updateDisplayName(
  userId: string,
  name: string,
): Promise<Account> {
  const account = await requireAccount(userId);
  account.name = name.trim().slice(0, 80);
  await kv().set(userKey(account.email), account);
  return account;
}

export async function updateEmail(
  userId: string,
  email: string,
  password: string,
): Promise<Account> {
  const account = await requireAccount(userId);
  if (!(await bcrypt.compare(password, account.passwordHash))) {
    throw new Error("Current password is incorrect.");
  }

  const normalized = normalizeEmail(email);
  if (normalized !== account.email) {
    const taken = await kv().get<Account>(userKey(normalized));
    if (taken) throw new Error("An account with that email already exists.");
  }

  const previousEmail = account.email;
  account.email = normalized;
  // Write the new record before dropping the old key so a failure mid-way
  // leaves the account reachable rather than orphaned.
  await kv().set(userKey(normalized), account);
  await kv().set(userIdKey(account.id), normalized);
  if (previousEmail !== normalized) await kv().del(userKey(previousEmail));
  return account;
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  nextPassword: string,
): Promise<void> {
  const account = await requireAccount(userId);
  if (!(await bcrypt.compare(currentPassword, account.passwordHash))) {
    throw new Error("Current password is incorrect.");
  }
  account.passwordHash = await bcrypt.hash(nextPassword, 10);
  await kv().set(userKey(account.email), account);
}

export async function deleteAccount(
  userId: string,
  password: string,
): Promise<void> {
  const account = await requireAccount(userId);
  if (!(await bcrypt.compare(password, account.passwordHash))) {
    throw new Error("Current password is incorrect.");
  }

  const reportIds = await kv().smembers(unlockSetKey(userId));
  for (const reportId of reportIds) {
    await kv().del(unlockKey(userId, reportId));
    await kv().srem(unlockSetKey(userId), reportId);
  }
  await kv().del(userKey(account.email));
  await kv().del(userIdKey(userId));
}
