import { recordUnlock } from "@/lib/accounts";
import { readSessionCookie } from "@/lib/auth";
import { markReportUnlocked } from "@/lib/store";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

function sessionPaid(status: string | null, paymentStatus: string | null) {
  return status === "complete" && paymentStatus === "paid";
}

export async function GET(request: Request) {
  if (!isStripeConfigured()) {
    return Response.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id")?.trim() ?? "";
  const reportId = url.searchParams.get("reportId")?.trim() ?? "";

  if (!sessionId || !reportId) {
    return Response.json(
      { error: "session_id and reportId are required" },
      { status: 400 },
    );
  }

  const user = readSessionCookie(request);
  if (!user) {
    return Response.json(
      { error: "Sign in to confirm this payment.", code: "login_required" },
      { status: 401 },
    );
  }

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    const sessionReportId =
      session.metadata?.reportId || session.client_reference_id || "";

    if (sessionReportId !== reportId) {
      return Response.json(
        { error: "Checkout session does not match this report" },
        { status: 403 },
      );
    }

    const sessionUserId = session.metadata?.userId;
    if (sessionUserId && sessionUserId !== user.id) {
      return Response.json(
        { error: "This Checkout session belongs to another account." },
        { status: 403 },
      );
    }

    if (!sessionPaid(session.status ?? null, session.payment_status ?? null)) {
      return Response.json(
        {
          paid: false,
          status: session.status,
          paymentStatus: session.payment_status,
        },
        { status: 402 },
      );
    }

    await markReportUnlocked(reportId, "stripe");
    await recordUnlock(user.id, reportId, "stripe");
    return Response.json({ paid: true, reportId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to verify Checkout";
    return Response.json({ error: message }, { status: 502 });
  }
}
