/**
 * Regression fixtures for the outbound fetch guard and the rate limiter.
 *
 * Run with `npm run test:net`. Like `detect-stack-fixtures.ts` this is executed
 * by `node --experimental-strip-types` and is excluded from the Next tsconfig —
 * do not import it from app code.
 *
 * No network is used: address classification and URL parsing are pure, and the
 * hostname cases below resolve through the OS resolver only for literals, which
 * short-circuit before DNS.
 */

import {
  checkPublicHttpUrl,
  isBlockedAddress,
  readBodyCapped,
} from "./net-guard.ts";
import { rateLimit, resetRateLimits } from "./rate-limit.ts";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const pass = actual === expected;
  if (!pass) failures += 1;
  const mark = pass ? "ok  " : "FAIL";
  const suffix = pass ? "" : `  (got ${String(actual)}, want ${String(expected)})`;
  console.log(`${mark} ${name}${suffix}`);
}

console.log("— blocked addresses —");
const BLOCKED: string[] = [
  "127.0.0.1",
  "127.1.2.3",
  "0.0.0.0",
  "10.0.0.1",
  "10.255.255.254",
  "172.16.0.1",
  "172.31.255.254",
  "192.168.1.1",
  "169.254.169.254", // AWS / GCP / Azure metadata
  "169.254.170.2", // ECS task metadata
  "100.64.0.1", // CGNAT
  "198.18.0.1",
  "192.0.2.1",
  "203.0.113.9",
  "224.0.0.1",
  "255.255.255.255",
  "::1",
  "::",
  "fe80::1",
  "fd00::1",
  "fc00::abcd",
  "ff02::1",
  "::ffff:127.0.0.1", // IPv4-mapped loopback
  "::ffff:169.254.169.254", // IPv4-mapped metadata
  "::ffff:7f00:1", // same, hex form
  "64:ff9b::127.0.0.1", // NAT64-wrapped loopback
  "2001:db8::1",
  "not-an-ip",
];
for (const ip of BLOCKED) check(`blocked ${ip}`, isBlockedAddress(ip), true);

console.log("\n— allowed addresses —");
const ALLOWED: string[] = [
  "1.1.1.1",
  "8.8.8.8",
  "93.184.216.34",
  "172.15.255.255", // just below the RFC1918 block
  "172.32.0.1", // just above it
  "100.63.255.255", // just below CGNAT
  "100.128.0.1", // just above it
  "2606:4700:4700::1111",
  "2a00:1450:4001:80e::200e",
];
for (const ip of ALLOWED) check(`allowed ${ip}`, isBlockedAddress(ip), false);

async function expectReject(name: string, url: string): Promise<void> {
  const result = await checkPublicHttpUrl(url);
  check(name, result.ok, false);
}

async function expectAccept(name: string, url: string): Promise<void> {
  const result = await checkPublicHttpUrl(url);
  check(name, result.ok, true);
}

async function urlCases(): Promise<void> {
  console.log("\n— url checks —");
  await expectReject("file: scheme", "file:///etc/passwd");
  await expectReject("gopher: scheme", "gopher://example.com/");
  await expectReject("data: scheme", "data:text/html,hi");
  await expectReject("localhost", "http://localhost/admin");
  await expectReject("localhost subdomain", "http://foo.localhost/");
  await expectReject("*.internal", "http://metadata.google.internal/");
  await expectReject("loopback literal", "http://127.0.0.1:80/");
  await expectReject("metadata literal", "http://169.254.169.254/latest/meta-data/");
  await expectReject("ipv6 loopback literal", "http://[::1]/");
  await expectReject("private ipv6 literal", "http://[fd00::1]/");
  await expectReject("non-standard port", "http://example.com:6379/");
  await expectReject("embedded credentials", "http://user:pass@example.com/");
  await expectReject("not a url", "just some text");

  // Public literals skip DNS entirely, so these stay offline.
  await expectAccept("public v4 literal", "https://1.1.1.1/sitemap.xml");
  await expectAccept("public v6 literal", "https://[2606:4700:4700::1111]/");
  await expectAccept("explicit port 443", "https://1.1.1.1:443/sitemap.xml");
}

function rateLimiterCases(): void {
  console.log("\n— rate limiter —");
  resetRateLimits();
  const rule = { limit: 3, windowMs: 60_000 };

  check("1st allowed", rateLimit("t:a", rule).ok, true);
  check("2nd allowed", rateLimit("t:a", rule).ok, true);
  const third = rateLimit("t:a", rule);
  check("3rd allowed", third.ok, true);
  check("3rd exhausts budget", third.remaining, 0);

  const fourth = rateLimit("t:a", rule);
  check("4th blocked", fourth.ok, false);
  check("4th sets retry-after", fourth.retryAfterSec > 0, true);

  check("other key unaffected", rateLimit("t:b", rule).ok, true);

  resetRateLimits();
  check("reset clears counters", rateLimit("t:a", rule).ok, true);

  // An expired window starts over.
  const instant = { limit: 1, windowMs: 1 };
  check("instant 1st", rateLimit("t:c", instant).ok, true);
  const start = Date.now();
  while (Date.now() - start < 5) {
    // busy-wait past the 1ms window
  }
  check("window rolls over", rateLimit("t:c", instant).ok, true);
}

/** A Response whose body streams `size` bytes in 1KB chunks, with no content-length. */
function streamingResponse(size: number): Response {
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= size) {
        controller.close();
        return;
      }
      const chunk = Math.min(1024, size - sent);
      sent += chunk;
      controller.enqueue(new Uint8Array(chunk).fill(0x61));
    },
  });
  return new Response(stream);
}

async function bodyCapCases(): Promise<void> {
  console.log("\n— body caps —");

  const under = await readBodyCapped(streamingResponse(5_000), 10_000, "error");
  check("under cap reads fully", under.ok && under.body.byteLength, 5_000);
  check("under cap not truncated", under.ok && under.truncated, false);

  const over = await readBodyCapped(streamingResponse(50_000), 10_000, "error");
  check("over cap errors in error mode", over.ok, false);

  const cut = await readBodyCapped(streamingResponse(50_000), 10_000, "truncate");
  check("truncate mode succeeds", cut.ok, true);
  check("truncate stops at the cap", cut.ok && cut.body.byteLength, 10_000);
  check("truncate flags itself", cut.ok && cut.truncated, true);

  // A lying content-length must not let a large body through in error mode.
  const declared = new Response(new Uint8Array(50_000), {
    headers: { "content-length": "999999999" },
  });
  const rejected = await readBodyCapped(declared, 10_000, "error");
  check("declared oversize rejected", rejected.ok, false);
}

await urlCases();
await bodyCapCases();
rateLimiterCases();

console.log(
  `\n${failures === 0 ? "All net-guard fixtures passed." : `${failures} fixture(s) FAILED.`}`,
);
if (failures > 0) process.exit(1);
