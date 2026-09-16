import { recordUnlock } from "@/lib/accounts";
import { readSessionCookie } from "@/lib/auth";
import {
  fetchPaymentLink,
  isRazorpayConfigured,
  paymentLinkIsPaid,
  verifyPaymentLinkSignature,
} from "@/lib/razorpay";
import { markReportUnlocked } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Confirm a Payment Link return.
 *
 * Two independent checks, because either alone is insufficient:
 *  1. The callback signature proves Razorpay produced these parameters.
 *  2. The link is then re-fetched from Razorpay, and the report/user mapping
 *     plus the paid status are read from *that* — never from the query string.
 *
 * A signature only proves the values were not tampered with; it does not prove
 * they describe a completed payment for this report, and `notes` is not part of
 * the signed payload at all.
 */
export async function GET(request: Request) {
  if (!isRazorpayConfigured()) {
    return Response.json({ error: "Razorpay is not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const get = (key: string) => url.searchParams.get(key)?.trim() ?? "";

  const params = {
    razorpay_payment_id: get("razorpay_payment_id"),
    razorpay_payment_link_id: get("razorpay_payment_link_id"),
    razorpay_payment_link_reference_id: get("razorpay_payment_link_reference_id"),
    razorpay_payment_link_status: get("razorpay_payment_link_status"),
    razorpay_signature: get("razorpay_signature"),
  };
  const reportId = get("reportId");

  if (!reportId) {
    return Response.json({ error: "reportId is required" }, { status: 400 });
  }
  if (
    !params.razorpay_payment_id ||
    !params.razorpay_payment_link_id ||
    !params.razorpay_signature
  ) {
    return Response.json(
      { error: "Missing Razorpay callback parameters" },
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

  if (!verifyPaymentLinkSignature(params)) {
    return Response.json(
      { error: "Payment signature did not verify." },
      { status: 403 },
    );
  }

  try {
    const link = await fetchPaymentLink(params.razorpay_payment_link_id);

    if (link.notes?.reportId !== reportId) {
      return Response.json(
        { error: "This payment does not belong to this report." },
        { status: 403 },
      );
    }
    if (link.notes?.userId && link.notes.userId !== user.id) {
      return Response.json(
        { error: "This payment belongs to another account." },
        { status: 403 },
      );
    }

    if (!paymentLinkIsPaid(link)) {
      return Response.json(
        { paid: false, status: link.status },
        { status: 402 },
      );
    }

    await markReportUnlocked(reportId, "razorpay");
    await recordUnlock(user.id, reportId, "razorpay");
    return Response.json({ paid: true, reportId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to confirm payment";
    return Response.json({ error: message }, { status: 502 });
  }
}
