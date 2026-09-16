import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/**
 * Outbound fetch guard.
 *
 * Every LiftScope network call is aimed at a URL the caller supplied — a sitemap
 * URL, a sample page, or a <loc> inside an uploaded sitemap index. Without a
 * guard that is a server-side request forgery primitive: the response body comes
 * back to the user as page titles and classifications.
 *
 * Rules enforced here:
 *  - http/https only, no embedded credentials, default ports only
 *  - hostname must resolve entirely to public unicast addresses
 *  - redirects are followed manually so every hop is re-checked
 *  - response bodies are capped while streaming, not after buffering
 *
 * Residual risk: DNS rebinding between our lookup and the socket connect is not
 * closed. Pinning the resolved address needs a custom undici dispatcher; when
 * this moves off in-memory infrastructure, do that too.
 */

export const MAX_REDIRECTS = 5;

function allowPrivateHosts(): boolean {
  return process.env.LIFTSCOPE_ALLOW_PRIVATE_HOSTS === "1";
}

/** [network, prefix length] pairs that must never be fetched. */
const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8], // this network
  ["10.0.0.0", 8], // RFC1918
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local + cloud metadata
  ["172.16.0.0", 12], // RFC1918
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // RFC1918
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let total = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    total = total * 256 + octet;
  }
  return total;
}

/** Expand an IPv6 literal to its eight 16-bit hextets. */
function expandIPv6(ip: string): number[] | null {
  let text = ip.trim().toLowerCase();
  if (text.startsWith("[") && text.endsWith("]")) text = text.slice(1, -1);
  const zone = text.indexOf("%");
  if (zone !== -1) text = text.slice(0, zone);

  // A trailing dotted-quad (::ffff:127.0.0.1) becomes two hextets.
  const dotted = text.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted && dotted.index !== undefined) {
    const asInt = ipv4ToInt(dotted[1]);
    if (asInt === null) return null;
    const high = Math.floor(asInt / 0x10000).toString(16);
    const low = (asInt % 0x10000).toString(16);
    text = `${text.slice(0, dotted.index)}${high}:${low}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;

  const hextets = [...head, ...Array<string>(fill).fill("0"), ...tail];
  if (hextets.length !== 8) return null;

  const out: number[] = [];
  for (const hextet of hextets) {
    if (!/^[0-9a-f]{1,4}$/.test(hextet)) return null;
    out.push(parseInt(hextet, 16));
  }
  return out;
}

function isBlockedV4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value === null) return true;
  return BLOCKED_V4.some(([network, prefix]) => {
    const base = ipv4ToInt(network);
    if (base === null) return false;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return ((value & mask) >>> 0) === ((base & mask) >>> 0);
  });
}

function isBlockedV6(ip: string): boolean {
  const hextets = expandIPv6(ip);
  if (!hextets) return true;

  // IPv4-mapped (::ffff:0:0/96) and NAT64 (64:ff9b::/96) carry a v4 address.
  const isMapped =
    hextets.slice(0, 5).every((h) => h === 0) && hextets[5] === 0xffff;
  const isNat64 =
    hextets[0] === 0x64 &&
    hextets[1] === 0xff9b &&
    hextets.slice(2, 6).every((h) => h === 0);
  if (isMapped || isNat64) {
    const high = hextets[6];
    const low = hextets[7];
    const v4 = [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
    return isBlockedV4(v4);
  }

  if (hextets.every((h) => h === 0)) return true; // ::
  if (hextets.slice(0, 7).every((h) => h === 0) && hextets[7] === 1) return true; // ::1

  const firstByte = hextets[0] >> 8;
  if ((firstByte & 0xfe) === 0xfc) return true; // fc00::/7 unique local
  if (firstByte === 0xff) return true; // ff00::/8 multicast
  if ((hextets[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if (hextets[0] === 0x2001 && hextets[1] === 0x0db8) return true; // 2001:db8::/32

  return false;
}

/** True when an IP literal is loopback, private, link-local, or otherwise reserved. */
export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isBlockedV4(ip);
  if (family === 6) return isBlockedV6(ip);
  return true;
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; error: string };

/**
 * Parse a caller-supplied URL and confirm every address it resolves to is a
 * public unicast address.
 */
export async function checkPublicHttpUrl(raw: string): Promise<UrlCheck> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "Not a valid absolute URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http and https URLs are fetched" };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      error: "URLs with embedded credentials are not fetched",
    };
  }

  const port = url.port;
  if (port && port !== "80" && port !== "443") {
    return { ok: false, error: `Port ${port} is not fetched — use 80 or 443` };
  }

  if (allowPrivateHosts()) return { ok: true, url };

  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  if (/(^|\.)localhost$/i.test(hostname) || /\.internal$/i.test(hostname)) {
    return { ok: false, error: "Internal hostnames are not fetched" };
  }

  if (isIP(hostname)) {
    return isBlockedAddress(hostname)
      ? {
          ok: false,
          error: "That address is private or reserved and is not fetched",
        }
      : { ok: true, url };
  }

  let resolved: { address: string }[];
  try {
    resolved = await lookup(hostname, { all: true });
  } catch {
    return { ok: false, error: `Could not resolve ${hostname}` };
  }

  if (resolved.length === 0) {
    return { ok: false, error: `Could not resolve ${hostname}` };
  }
  // Any private answer disqualifies the host — a split result is the DNS
  // rebinding shape, not a reason to pick the public address.
  if (resolved.some((entry) => isBlockedAddress(entry.address))) {
    return {
      ok: false,
      error: `${hostname} resolves to a private or reserved address and is not fetched`,
    };
  }

  return { ok: true, url };
}

/**
 * What to do when a body runs past the cap.
 *
 * `"error"` suits XML, where a truncated document cannot be parsed.
 * `"truncate"` suits HTML classification, which only reads the head of the
 * document and should not lose a page for being large.
 */
export type OverflowMode = "error" | "truncate";

/** Read a response body, stopping once it exceeds maxBytes. */
export async function readBodyCapped(
  response: Response,
  maxBytes: number,
  onOverflow: OverflowMode = "error",
): Promise<{ ok: true; body: Buffer; truncated: boolean } | { ok: false; error: string }> {
  const tooLarge = { ok: false as const, error: `Response larger than ${maxBytes} bytes` };

  if (!response.body) return { ok: true, body: Buffer.alloc(0), truncated: false };

  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes && onOverflow === "error") {
    await response.body.cancel().catch(() => {});
    return tooLarge;
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        if (onOverflow === "error") {
          await reader.cancel().catch(() => {});
          return tooLarge;
        }
        const keep = maxBytes - (total - value.byteLength);
        if (keep > 0) chunks.push(Buffer.from(value.subarray(0, keep)));
        await reader.cancel().catch(() => {});
        return { ok: true, body: Buffer.concat(chunks), truncated: true };
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Read failed",
    };
  }
  return { ok: true, body: Buffer.concat(chunks), truncated: false };
}

export interface SafeFetchOptions {
  accept: string;
  timeoutMs: number;
  maxBytes: number;
  userAgent: string;
  /** Defaults to "error". */
  onOverflow?: OverflowMode;
}

export type SafeFetchResult =
  | {
      ok: true;
      body: Buffer;
      headers: Record<string, string>;
      finalUrl: string;
      status: number;
      truncated: boolean;
    }
  | { ok: false; error: string };

/**
 * Fetch a caller-supplied URL with the guard applied to the initial request and
 * to every redirect hop. One deadline covers the whole chain.
 */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions,
): Promise<SafeFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    let target = rawUrl;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const checked = await checkPublicHttpUrl(target);
      if (!checked.ok) return { ok: false, error: checked.error };

      const response = await fetch(checked.url, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent": options.userAgent,
          Accept: options.accept,
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => {});
        if (!location) {
          return {
            ok: false,
            error: `HTTP ${response.status} without a Location header`,
          };
        }
        if (hop === MAX_REDIRECTS) {
          return { ok: false, error: `More than ${MAX_REDIRECTS} redirects` };
        }
        target = new URL(location, checked.url).href;
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        return {
          ok: false,
          error: `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
        };
      }

      const read = await readBodyCapped(
        response,
        options.maxBytes,
        options.onOverflow ?? "error",
      );
      if (!read.ok) return { ok: false, error: read.error };

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      return {
        ok: true,
        body: read.body,
        headers,
        finalUrl: checked.url.href,
        status: response.status,
        truncated: read.truncated,
      };
    }

    return { ok: false, error: `More than ${MAX_REDIRECTS} redirects` };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `Timed out after ${options.timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : "Fetch failed";
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}
