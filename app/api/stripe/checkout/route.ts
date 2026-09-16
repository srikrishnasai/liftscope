import { getReport } from "@/lib/store";
import { readSessionCookie } from "@/lib/auth";
import {
  getStripe,
  isStripeConfigured,
  publicAppUrl,
  stripeCurrency,
  stripePriceId,
  stripeUnitAmount,
  UNLOCK_PRODUCT_NAME,
} from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return Response.json(
      { error: "Stripe is not configured. Set STRIPE_SECRET_KEY." },
      { status: 503 },
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
      { error: "Sign in before starting Checkout.", code: "login_required" },
      { status: 401 },
    );
  }

  const report = await getReport(reportId);
  if (!report) {
    return Response.json(
      {
        error:
          "Report is not in server memory. Re-run the estimate, then pay from this browser.",
      },
      { status: 404 },
    );
  }

  const base = publicAppUrl(request);
  const priceId = stripePriceId();
  const lineItems = priceId
    ? [{ price: priceId, quantity: 1 }]
    : [
        {
          price_data: {
            currency: stripeCurrency(),
            unit_amount: stripeUnitAmount(),
            product_data: {
              name: UNLOCK_PRODUCT_NAME,
              description:
                "Remaining risks, phased plan, client memo, and the checklist of what would move this estimate.",
            },
          },
          quantity: 1,
        },
      ];

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      client_reference_id: reportId,
      customer_email: user.email,
      metadata: {
        reportId,
        userId: user.id,
        email: user.email,
        target: report.input.target,
      },
      success_url: `${base}/report/${encodeURIComponent(reportId)}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/report/${encodeURIComponent(reportId)}?checkout=canceled`,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return Response.json(
        { error: "Stripe did not return a checkout URL" },
        { status: 502 },
      );
    }

    return Response.json({ url: session.url, id: session.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to start Checkout";
    return Response.json({ error: message }, { status: 502 });
  }
}
