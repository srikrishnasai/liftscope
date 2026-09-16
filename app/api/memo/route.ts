import { aiMemoConfigured, polishMemoWithAi, resolveAiMemoConfig } from "@/lib/ai-memo";
import { buildTemplateMemo } from "@/lib/memo";
import {
  clientKey,
  rateLimit,
  rateLimitHeaders,
  tooManyRequests,
} from "@/lib/rate-limit";
import { normalizeTighten, type TightenAnswers } from "@/lib/tighten";
import type { EstimateReport } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const TEMPLATE_RULE = { limit: 60, windowMs: 10 * 60 * 1000 };
const POLISH_RULE = { limit: 6, windowMs: 10 * 60 * 1000 };

export async function GET() {
  const config = resolveAiMemoConfig();
  return Response.json({
    ai: Boolean(config),
    provider: config?.provider ?? null,
    model: config ? config.model : null,
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Expected an object" }, { status: 400 });
  }

  const raw = body as {
    report?: EstimateReport;
    tighten?: TightenAnswers;
    polish?: boolean;
  };

  if (!raw.report || typeof raw.report !== "object" || !raw.report.score) {
    return Response.json({ error: "report is required" }, { status: 400 });
  }

  const wantsPolish = Boolean(raw.polish) && aiMemoConfigured();

  // The template path is pure CPU; the polish path spends a model token budget
  // on a report body the caller supplied, so it gets the tighter bucket.
  const limited = rateLimit(
    clientKey(request, wantsPolish ? "memo-polish" : "memo"),
    wantsPolish ? POLISH_RULE : TEMPLATE_RULE,
  );
  if (!limited.ok) {
    return tooManyRequests(
      limited,
      wantsPolish
        ? "Too many AI polish requests from this address. The template memo is still available."
        : "Too many memo requests from this address. Try again shortly.",
    );
  }

  const tighten = raw.tighten ? normalizeTighten(raw.tighten) : undefined;
  const report = stripHeavyFields(raw.report);
  const headers = rateLimitHeaders(limited);

  if (wantsPolish) {
    const memo = await polishMemoWithAi(report, tighten);
    return Response.json(memo, { headers });
  }

  return Response.json(buildTemplateMemo(report, tighten), { headers });
}

function stripHeavyFields(report: EstimateReport): EstimateReport {
  const { sitemapXml: _xml, ...input } = report.input;
  return {
    ...report,
    input,
    crawl: {
      ...report.crawl,
      pages: report.crawl.pages.slice(0, 20),
    },
  };
}
