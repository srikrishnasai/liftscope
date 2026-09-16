import { recordUnlock } from "@/lib/accounts";
import {
  isRazorpayConfigured,
  razorpayWebhookSecret,
  verifyWebhookSignature,
} from "@/lib/razorpay";
import { markReportUnlocked } from "@/lib/store";

export const runtime = "nodejs";

interface PaymentLinkWebhook {
  event?: string;
  payload?: {
    payment_link?: {
      entity?: {
        status?: string;
        amount?: number;
        amount_paid?: number;
        notes?: Record<string, string>;
      };
    };
  };
}

/**
 * Backstop for a buyer who pays and closes the tab before the callback runs.
 *
 * Signed with `RAZORPAY_WEBHOOK_SECRET` over the raw body — a different secret
 * from the one that signs the callback. The body must be read as text before
 * parsing, or the bytes that were signed are not the bytes verified.
 */
export async function POST(request: Request) {
  if (!isRazorpayConfigured() || !razorpayWebhookSecret()) {
    return Response.json(
      { error: "Razorpay webhook is not configured" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) {
    return Response.json(
      { error: "Missing x-razorpay-signature" },
      { status: 400 },
    );
  }

  const raw = await request.text();
  if (!verifyWebhookSignature(raw, signature)) {
    return Response.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  let event: PaymentLinkWebhook;
  try {
    event = JSON.parse(raw) as PaymentLinkWebhook;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (event.event === "payment_link.paid") {
    const entity = event.payload?.payment_link?.entity;
    const reportId = entity?.notes?.reportId;
    const userId = entity?.notes?.userId;
    const fullyPaid =
      entity?.status === "paid" &&
      typeof entity.amount === "number" &&
      typeof entity.amount_paid === "number" &&
      entity.amount_paid >= entity.amount;

    if (reportId && fullyPaid) {
      await markReportUnlocked(reportId, "razorpay");
      if (userId) await recordUnlock(userId, reportId, "razorpay");
    }
  }

  return Response.json({ received: true });
}
