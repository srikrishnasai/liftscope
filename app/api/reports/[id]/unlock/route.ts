import { userHasUnlock } from "@/lib/accounts";
import {
  createVisitorId,
  encodeVisitor,
  freeClaimState,
  readSubjects,
  visitorCookieHeader,
} from "@/lib/entitlements";
import { isRazorpayConfigured } from "@/lib/razorpay";
import { isReportUnlocked } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Which gate this caller sees for this report.
 *
 *   open  — already unlocked (paid, free claim, demo, or payments off)
 *   free  — this caller has not spent their one free report yet
 *   login — free report already spent, and they need an account to pay
 *   pay   — signed in, free report spent, payment required
 *
 * Issues the visitor cookie on first contact so an anonymous first-timer can
 * hold a free claim without signing up.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const subjects = readSubjects(request);

  // Mint a visitor id on first contact so the free claim has somewhere to live.
  const headers: Record<string, string> = {};
  let visitorId = subjects.visitorId;
  if (!visitorId) {
    visitorId = createVisitorId();
    headers["Set-Cookie"] = visitorCookieHeader(encodeVisitor(visitorId));
    subjects.visitorId = visitorId;
    subjects.keys.unshift(`visitor:${visitorId}`);
  }

  const user = subjects.user;
  const respond = (body: Record<string, unknown>) =>
    Response.json(
      { ...body, user: user ? { email: user.email } : null },
      { headers },
    );

  // Payments off: everything stays open, as before.
  if (!isRazorpayConfigured()) {
    return respond({ unlocked: await isReportUnlocked(id), gate: "open" });
  }

  if (user && (await userHasUnlock(user.id, id))) {
    return respond({ unlocked: true, gate: "open" });
  }

  const free = await freeClaimState(subjects, id);
  if (free.status === "claimed-here") {
    return respond({ unlocked: true, gate: "open", via: "free" });
  }
  if (free.status === "available") {
    return respond({ unlocked: false, gate: "free" });
  }

  if (!user) {
    return respond({ unlocked: false, gate: "login", freeSpentOn: free.reportId });
  }
  return respond({ unlocked: false, gate: "pay", freeSpentOn: free.reportId });
}
