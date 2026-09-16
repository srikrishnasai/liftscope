import { randomBytes } from "node:crypto";
import { readSessionCookie } from "@/lib/auth";
import {
  clientKey,
  rateLimit,
  tooManyRequests,
} from "@/lib/rate-limit";
import {
  createPaymentLink,
  isRazorpayConfigured,
  publicAppUrl,
  razorpayCurrency,
  razorpayUnitAmount,
  UNLOCK_PRODUCT_NAME,
} from "@/lib/razorpay";
import { getReport } from "@/lib/store";

export const runtime = "nodejs";

const CHECKOUT_RULE = { limit: 12, windowMs: 10 * 60 * 1000 };

export async function POST(request: Request) {
  if (!isRazorpayConfigured()) {
    return Response.json(
      {
        error:
          "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
      },
      { status: 503 },
    );
  }

  const limited = rateLimit(clientKey(request, "rzp-checkout"), CHECKOUT_RULE);
  if (!limited.ok) {
    return tooManyRequests(
      limited,
      "Too many payment attempts from this address. Try again in a few minutes.",
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reportId =
    body &&
    typeof body === "object" &&
    "reportId" in body &&
    typeof (body as { reportId?: unknown }).reportId === "string"
      ? (body as { reportId: string }).reportId.trim()
      : "";

  if (!reportId) {
    return Response.json({ error: "reportId is required" }, { status: 400 });
  }

  const user = readSessionCookie(request);
  if (!user) {
    return Response.json(
      { error: "Sign in before paying.", code: "login_required" },
      { status: 401 },
    );
  }

  const report = await getReport(reportId);
  if (!report) {
    return Response.json(
      {
        error:
          "That report has expired or could not be found. Re-run the estimate, then pay.",
      },
      { status: 404 },
    );
  }

  const base = publicAppUrl(request);

  try {
    const link = await createPaymentLink({
      amount: razorpayUnitAmount(),
      currency: razorpayCurrency(),
      description: `${UNLOCK_PRODUCT_NAME} — ${reportId}`,
      // reference_id must be unique per link, and a buyer may abandon and
      // retry, so it carries a nonce. The authoritative report/user mapping
      // is read back from `notes` server-side, never parsed from this.
      referenceId: `${reportId}:${randomBytes(4).toString("hex")}`,
      callbackUrl: `${base}/report/${encodeURIComponent(reportId)}`,
      email: user.email,
      notes: {
        reportId,
        userId: user.id,
        email: user.email,
        target: report.input.target,
      },
    });

    if (!link.short_url) {
      return Response.json(
        { error: "Razorpay did not return a payment URL" },
        { status: 502 },
      );
    }

    return Response.json({ url: link.short_url, id: link.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to start payment";
    return Response.json({ error: message }, { status: 502 });
  }
}
