import Stripe from "stripe";

export const UNLOCK_PRODUCT_NAME = "LiftScope full report";
export const DEFAULT_UNIT_AMOUNT = 4900;
export const DEFAULT_CURRENCY = "usd";

export function stripeSecretKey(): string | undefined {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key || undefined;
}

export function isStripeConfigured(): boolean {
  return Boolean(stripeSecretKey());
}

export function stripeUnitAmount(): number {
  const raw = Number(process.env.STRIPE_UNIT_AMOUNT);
  if (Number.isFinite(raw) && raw >= 50) return Math.round(raw);
  return DEFAULT_UNIT_AMOUNT;
}

export function stripeCurrency(): string {
  return (process.env.STRIPE_CURRENCY || DEFAULT_CURRENCY).toLowerCase();
}

export function stripePriceId(): string | undefined {
  const id = process.env.STRIPE_PRICE_ID?.trim();
  return id || undefined;
}

let client: Stripe | null = null;

export function getStripe(): Stripe {
  const key = stripeSecretKey();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  if (!client) {
    client = new Stripe(key);
  }
  return client;
}

export function formatUnlockPrice(
  amount = stripeUnitAmount(),
  currency = stripeCurrency(),
): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: amount % 100 === 0 ? 0 : 2,
    }).format(amount / 100);
  } catch {
    return `$${(amount / 100).toFixed(2)}`;
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

export function stripePublicConfig() {
  return {
    configured: isStripeConfigured(),
    amount: stripeUnitAmount(),
    currency: stripeCurrency(),
    formatted: formatUnlockPrice(),
    testMode: (stripeSecretKey() ?? "").startsWith("sk_test_"),
  };
}
