import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";

/**
 * Durable key-value storage behind a two-adapter driver.
 *
 * Why this exists: reports lived in a per-process `Map` and accounts in a JSON
 * file under `/tmp` on Vercel. Both vanish on a cold start or a second
 * instance, so a user could pay through Stripe and land on a report the server
 * no longer had — with no record that they had bought anything.
 *
 * Adapters:
 *  - **upstash** when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are
 *    set. REST-based, so there is no connection pool to exhaust on serverless.
 *  - **file** otherwise. A single JSON file under `dataDir()`, which keeps
 *    `npm install && npm run dev` working with no credentials — a stated
 *    product property, not an accident.
 *
 * The file adapter is for local development. It is process-local for writes
 * (last write wins) and is not safe for concurrent instances.
 */

export interface KvDriver {
  readonly name: "file" | "upstash";
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  sadd(key: string, member: string): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
}

export function dataDir(): string {
  if (process.env.LIFTSCOPE_DATA_DIR) return process.env.LIFTSCOPE_DATA_DIR;
  if (process.env.VERCEL) return "/tmp/liftscope";
  return path.join(process.cwd(), "data");
}

export function isDurableStoreConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

/* ------------------------------------------------------------------ file -- */

interface FileEntry {
  value: unknown;
  /** Epoch ms, or null for no expiry. */
  expiresAt: number | null;
}

interface FileShape {
  entries: Record<string, FileEntry>;
  sets: Record<string, string[]>;
}

const EMPTY_FILE: FileShape = { entries: {}, sets: {} };

class FileDriver implements KvDriver {
  readonly name = "file" as const;
  /** Cached between calls; this driver assumes a single writing process. */
  private cache: FileShape | null = null;

  private filePath(): string {
    return path.join(dataDir(), "store.json");
  }

  private read(): FileShape {
    if (this.cache) return this.cache;
    let data: FileShape;
    try {
      const parsed = JSON.parse(readFileSync(this.filePath(), "utf8")) as FileShape;
      data = {
        entries: parsed.entries ?? {},
        sets: parsed.sets ?? {},
      };
    } catch {
      data = { ...EMPTY_FILE, entries: {}, sets: {} };
    }
    this.prune(data);
    this.cache = data;
    return data;
  }

  private prune(data: FileShape): void {
    const now = Date.now();
    for (const [key, entry] of Object.entries(data.entries)) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        delete data.entries[key];
      }
    }
  }

  private write(data: FileShape): void {
    this.prune(data);
    this.cache = data;
    const dir = dataDir();
    mkdirSync(dir, { recursive: true });
    const target = this.filePath();
    const temp = `${target}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(data, null, 2), "utf8");
    renameSync(temp, target);
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.read().entries[key];
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) return null;
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const data = this.read();
    data.entries[key] = {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    };
    this.write(data);
  }

  async del(key: string): Promise<void> {
    const data = this.read();
    delete data.entries[key];
    this.write(data);
  }

  async sadd(key: string, member: string): Promise<void> {
    const data = this.read();
    const members = new Set(data.sets[key] ?? []);
    members.add(member);
    data.sets[key] = [...members];
    this.write(data);
  }

  async srem(key: string, member: string): Promise<void> {
    const data = this.read();
    const members = (data.sets[key] ?? []).filter((m) => m !== member);
    if (members.length === 0) delete data.sets[key];
    else data.sets[key] = members;
    this.write(data);
  }

  async smembers(key: string): Promise<string[]> {
    return [...(this.read().sets[key] ?? [])];
  }

  /** Test seam. */
  reset(): void {
    this.cache = null;
  }
}

/* --------------------------------------------------------------- upstash -- */

/**
 * Minimal structural type for the Upstash client, so this module does not carry
 * the SDK's types into every consumer.
 */
interface UpstashClient {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, opts?: { ex: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
  sadd(key: string, member: string): Promise<unknown>;
  srem(key: string, member: string): Promise<unknown>;
  smembers(key: string): Promise<unknown>;
}

class UpstashDriver implements KvDriver {
  readonly name = "upstash" as const;
  // Written out rather than a constructor parameter property: the fixture
  // runner (node --experimental-strip-types) cannot strip those.
  private readonly client: UpstashClient;

  constructor(client: UpstashClient) {
    this.client = client;
  }

  async get<T>(key: string): Promise<T | null> {
    // The client already JSON-decodes what it stored; null means missing.
    const value = await this.client.get(key);
    return (value ?? null) as T | null;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) await this.client.set(key, value, { ex: ttlSeconds });
    else await this.client.set(key, value);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async sadd(key: string, member: string): Promise<void> {
    await this.client.sadd(key, member);
  }

  async srem(key: string, member: string): Promise<void> {
    await this.client.srem(key, member);
  }

  async smembers(key: string): Promise<string[]> {
    const members = await this.client.smembers(key);
    return Array.isArray(members) ? (members as string[]) : [];
  }
}

/* ---------------------------------------------------------------- driver -- */

let driver: KvDriver | null = null;

export function kv(): KvDriver {
  if (driver) return driver;

  if (isDurableStoreConfigured()) {
    driver = new UpstashDriver(
      new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL as string,
        token: process.env.UPSTASH_REDIS_REST_TOKEN as string,
      }),
    );
  } else {
    driver = new FileDriver();
  }

  return driver;
}

/** Test seam — drops the cached driver so env changes take effect. */
export function resetKv(): void {
  driver = null;
}
