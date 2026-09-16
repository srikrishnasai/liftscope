import { analyze } from "@/lib/analyze";
import { clientKey, rateLimit, rateLimitHeaders, tooManyRequests } from "@/lib/rate-limit";
import { saveReport } from "@/lib/store";
import { parseEstimateRequest } from "@/lib/validate";

export const runtime = "nodejs";
export const maxDuration = 60;

/** A live analysis crawls up to 12 pages plus child sitemaps. Demo runs no network. */
const LIVE_RULE = { limit: 8, windowMs: 10 * 60 * 1000 };
const DEMO_RULE = { limit: 40, windowMs: 10 * 60 * 1000 };

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const isDemo =
    Boolean(body) &&
    typeof body === "object" &&
    (body as { demo?: unknown }).demo === true;

  const limited = rateLimit(
    clientKey(request, isDemo ? "analyze-demo" : "analyze"),
    isDemo ? DEMO_RULE : LIVE_RULE,
  );
  if (!limited.ok) {
    return tooManyRequests(
      limited,
      isDemo
        ? "Too many sample runs from this address. Try again shortly."
        : "Too many estimates from this address. Crawling is rate limited — try again in a few minutes, or re-open a report you already ran.",
    );
  }

  try {
    const input = parseEstimateRequest(body);
    const report = await analyze(input);
    await saveReport(report);
    return Response.json(report, { headers: rateLimitHeaders(limited) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    const status = message.startsWith("target") || message.includes("must")
      ? 400
      : 500;
    return Response.json({ error: message }, { status });
  }
}
