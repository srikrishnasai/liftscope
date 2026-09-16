import { recordUnlock } from "@/lib/accounts";
import {
  claimFreeReport,
  createVisitorId,
  encodeVisitor,
  freeClaimState,
  readSubjects,
  visitorCookieHeader,
} from "@/lib/entitlements";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getReport, markReportUnlocked } from "@/lib/store";

export const runtime = "nodejs";

/** The giveaway is one per visitor, but the endpoint is still public. */
const CLAIM_RULE = { limit: 20, windowMs: 60 * 60 * 1000 };

/**
 * Spend this caller's one free report on `id`.
 *
 * Idempotent for the report it was already spent on, so a double-click or a
 * refresh does not error.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const limited = rateLimit(clientKey(request, "claim-free"), CLAIM_RULE);
  if (!limited.ok) {
    return tooManyRequests(
      limited,
      "Too many requests from this address. Try again shortly.",
    );
  }

  const report = await getReport(id);
  if (!report) {
    return Response.json(
      { error: "That report has expired or could not be found." },
      { status: 404 },
    );
  }

  const subjects = readSubjects(request);
  const headers: Record<string, string> = {};
  if (!subjects.visitorId) {
    const visitorId = createVisitorId();
    headers["Set-Cookie"] = visitorCookieHeader(encodeVisitor(visitorId));
    subjects.visitorId = visitorId;
    subjects.keys.unshift(`visitor:${visitorId}`);
  }

  const free = await freeClaimState(subjects, id);

  if (free.status === "spent") {
    return Response.json(
      {
        error:
          "Your free report has already been used. Unlocking another one is a paid upgrade.",
        code: "free_spent",
        freeSpentOn: free.reportId,
      },
      { status: 409, headers },
    );
  }

  if (free.status === "available") {
    await claimFreeReport(subjects, id);
    await markReportUnlocked(id, "free");
    if (subjects.user) {
      await recordUnlock(subjects.user.id, id, "free");
    }
  }

  return Response.json({ unlocked: true, via: "free" }, { headers });
}
