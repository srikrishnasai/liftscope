export function uniqueValidUrls(urls: string[], cap = 4000): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    if (!raw || out.length >= cap) break;
    try {
      const url = new URL(raw);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      if (seen.has(url.href)) continue;
      seen.add(url.href);
      out.push(url.href);
    } catch {
      // skip malformed
    }
  }
  return out;
}

export function parseSampleUrls(raw: string | string[] | undefined): string[] {
  const text = Array.isArray(raw) ? raw.join("\n") : (raw ?? "");
  const parts = text
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return uniqueValidUrls(parts, 20);
}
