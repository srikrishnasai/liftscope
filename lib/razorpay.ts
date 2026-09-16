import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay Payment Links.
 *
 * Payment Links rather than Checkout.js: the link flow is a redirect, which
 * matches the shape the unlock panel already had under Stripe and keeps a
 * third-party script out of the app. UPI, cards, netbanking, and wallets are
 * all offered on Razorpay's hosted page.
 *
 * Amounts are in **paise** (the smallest INR unit), so ₹1,499 is 149900.
 *
 * Two different secrets are in play and they are not interchangeable:
 *  - `RAZORPAY_KEY_SECRET` signs API auth and the *callback* signature
 *  - `RAZORPAY_WEBHOOK_SECRET` signs the *webhook* body
 */

export const UNLOCK_PRODUCT_NAME = "LiftScope full report";
/** ₹1,499. Override with RAZORPAY_UNIT_AMOUNT (in paise). */
export const DEFAULT_UNIT_AMOUNT = 149900;
export const DEFAULT_CURRENCY = "INR";
const API_BASE = "https://api.razorpay.com/v1";

export function razorpayKeyId(): string | undefined {
  return process.env.RAZORPAY_KEY_ID?.trim() || undefined;
}

export function razorpayKeySecret(): string | undefined {
  return process.env.RAZORPAY_KEY_SECRET?.trim() || undefined;
}

export function razorpayWebhookSecret(): string | undefined {
  return process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || undefined;
}

export function isRazorpayConfigured(): boolean {
  return Boolean(razorpayKeyId() && razorpayKeySecret());
}

/** Razorpay's own minimum is ₹1 (100 paise). */
export function razorpayUnitAmount(): number {
  const raw = Number(process.env.RAZORPAY_UNIT_AMOUNT);
  if (Number.isFinite(raw) && raw >= 100) return Math.round(raw);
  return DEFAULT_UNIT_AMOUNT;
}

export function razorpayCurrency(): string {
  return (process.env.RAZORPAY_CURRENCY || DEFAULT_CURRENCY).toUpperCase();
}

/** Test keys are `rzp_test_...`, live keys `rzp_live_...`. */
export function isTestMode(): boolean {
  return (razorpayKeyId() ?? "").startsWith("rzp_test");
}

/**
 * Price display.
 *
 * en-IN is pinned deliberately here: INR is conventionally grouped in the
 * Indian system (₹1,499 / ₹1,20,000). This is not the same thing as the bare
 * `toLocaleString()` bug that `formatCount` exists to prevent — that one
 * followed whatever locale the *server* happened to have. Do not "fix" this
 * one to en-US.
 */
export function formatUnlockPrice(
  amount = razorpayUnitAmount(),
  currency = razorpayCurrency(),
): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 100 === 0 ? 0 : 2,
    }).format(amount / 100);
  } catch {
    return `₹${(amount / 100).toFixed(2)}`;
  }
}

export function publicAppUrl(request: Request): string {
  const origin = request.headers.get("origin");
  if (origin) return origin.replace(/\/$/, "");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) return `${proto}://${host}`.replace(/\/$/, "");
  return (process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:43173").replace(
    /\/$/,
    "",
  );
}

export function razorpayPublicConfig() {
  return {
    configured: isRazorpayConfigured(),
    amount: razorpayUnitAmount(),
    currency: razorpayCurrency(),
    formatted: formatUnlockPrice(),
    testMode: isTestMode(),
  };
}

/* ----------------------------------------------------------- signatures -- */

/** Constant-time compare of two hex digests. */
function hexEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export interface PaymentLinkCallback {
  razorpay_payment_id: string;
  razorpay_payment_link_id: string;
  razorpay_payment_link_reference_id: string;
  razorpay_payment_link_status: string;
  razorpay_signature: string;
}

/**
 * Verify a Payment Link callback.
 *
 * Payload is `payment_link_id|payment_link_reference_id|payment_link_status|payment_id`
 * signed with the key secret — the order matters and differs from the
 * order-based flow, which signs `order_id|payment_id`.
 */
export function verifyPaymentLinkSignature(
  params: PaymentLinkCallback,
  secret = razorpayKeySecret(),
): boolean {
  if (!secret) return false;
  const payload = [
    params.razorpay_payment_link_id,
    params.razorpay_payment_link_reference_id,
    params.razorpay_payment_link_status,
    params.razorpay_payment_id,
  ].join("|");
  return hexEquals(sign(payload, secret), params.razorpay_signature);
}

/** Verify a webhook body against `x-razorpay-signature`. Uses the webhook secret. */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret = razorpayWebhookSecret(),
): boolean {
  if (!secret || !signature) return false;
  return hexEquals(sign(rawBody, secret), signature);
}

/* ------------------------------------------------------------------ api -- */

function authHeader(): string {
  const token = Buffer.from(
    `${razorpayKeyId()}:${razorpayKeySecret()}`,
    "utf8",
  ).toString("base64");
  return `Basic ${token}`;
}

async function callApi<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown } = { method: "GET" },
): Promise<T> {
  if (!isRazorpayConfigured()) {
    throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not set");
  }

  // Plain fetch, not safeFetch: this URL is ours, not caller-supplied.
  const response = await fetch(`${API_BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Razorpay returned a non-JSON response (${response.status})`);
  }

  if (!response.ok) {
    const description = (parsed as { error?: { description?: string } })?.error
      ?.description;
    throw new Error(description || `Razorpay API error ${response.status}`);
  }

  return parsed as T;
}

export interface PaymentLink {
  id: string;
  short_url: string;
  status: string;
  amount: number;
  amount_paid: number;
  currency: string;
  reference_id?: string;
  notes?: Record<string, string>;
}

export async function createPaymentLink(input: {
  amount: number;
  currency: string;
  description: string;
  referenceId: string;
  callbackUrl: string;
  email?: string;
  notes: Record<string, string>;
}): Promise<PaymentLink> {
  return callApi<PaymentLink>("/payment_links", {
    method: "POST",
    body: {
      amount: input.amount,
      currency: input.currency,
      accept_partial: false,
      description: input.description,
      reference_id: input.referenceId,
      customer: input.email ? { email: input.email } : undefined,
      // The app shows the outcome on return; no SMS/email nags from Razorpay.
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: input.notes,
      callback_url: input.callbackUrl,
      callback_method: "get",
    },
  });
}

export async function fetchPaymentLink(id: string): Promise<PaymentLink> {
  return callApi<PaymentLink>(`/payment_links/${encodeURIComponent(id)}`);
}

/** A link is settled only when Razorpay says paid and the full amount landed. */
export function paymentLinkIsPaid(link: PaymentLink): boolean {
  return link.status === "paid" && link.amount_paid >= link.amount;
}
