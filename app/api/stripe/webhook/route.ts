import { recordUnlock } from "@/lib/accounts";
import { markReportUnlocked } from "@/lib/store";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import type Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!isStripeConfigured() || !secret) {
    return Response.json(
      { error: "Stripe webhook is not configured" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, secret);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid webhook signature";
    return Response.json({ error: message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const reportId =
      session.metadata?.reportId || session.client_reference_id || "";
    const userId = session.metadata?.userId;
    if (reportId && session.payment_status === "paid") {
      await markReportUnlocked(reportId, "stripe");
      if (userId) await recordUnlock(userId, reportId, "stripe");
    }
  }

  return Response.json({ received: true });
}
