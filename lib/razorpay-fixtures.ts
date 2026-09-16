/**
 * Regression fixtures for Razorpay payment verification.
 *
 * Run with `npm run test:razorpay`. Executed by `node --experimental-strip-types`
 * and excluded from the Next tsconfig — do not import it from app code.
 *
 * This is the money path. A signature check that accepts a forged or replayed
 * callback hands out paid reports for free, and the failure is silent. The
 * concatenation order below is asserted against an independently computed HMAC
 * rather than against our own implementation, so a reordered payload fails here
 * instead of in production.
 *
 * No network: signing and verification are pure.
 */

import { createHmac } from "node:crypto";
import {
  DEFAULT_UNIT_AMOUNT,
  formatUnlockPrice,
  paymentLinkIsPaid,
  razorpayUnitAmount,
  verifyPaymentLinkSignature,
  verifyWebhookSignature,
  type PaymentLink,
} from "./razorpay.ts";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const pass = actual === expected;
  if (!pass) failures += 1;
  console.log(
    `${pass ? "ok  " : "FAIL"} ${name}${pass ? "" : `  (got ${String(actual)}, want ${String(expected)})`}`,
  );
}

const KEY_SECRET = "rzp_test_secret_value";
const WEBHOOK_SECRET = "whsec_razorpay_value";

const hmac = (payload: string, secret: string) =>
  createHmac("sha256", secret).update(payload).digest("hex");

/** A genuine callback, signed the way Razorpay signs it. */
function signedCallback(overrides: Partial<Record<string, string>> = {}) {
  const base = {
    razorpay_payment_id: "pay_ABC123",
    razorpay_payment_link_id: "plink_XYZ789",
    razorpay_payment_link_reference_id: "ls-report-1:9f3a",
    razorpay_payment_link_status: "paid",
    ...overrides,
  };
  const payload = [
    base.razorpay_payment_link_id,
    base.razorpay_payment_link_reference_id,
    base.razorpay_payment_link_status,
    base.razorpay_payment_id,
  ].join("|");
  return {
    ...base,
    razorpay_signature: hmac(payload, KEY_SECRET),
  } as Parameters<typeof verifyPaymentLinkSignature>[0];
}

console.log("— payload construction —");
{
  // Asserted against the documented order, independently of our own code:
  // payment_link_id | payment_link_reference_id | payment_link_status | payment_id
  const expected = hmac(
    "plink_XYZ789|ls-report-1:9f3a|paid|pay_ABC123",
    KEY_SECRET,
  );
  check("signs the documented field order", signedCallback().razorpay_signature, expected);

  // A plausible but wrong order (payment_id first, as in the order-based flow)
  // must not verify.
  const wrongOrder = {
    ...signedCallback(),
    razorpay_signature: hmac(
      "pay_ABC123|plink_XYZ789|ls-report-1:9f3a|paid",
      KEY_SECRET,
    ),
  };
  check("rejects the order-flow payload shape", verifyPaymentLinkSignature(wrongOrder, KEY_SECRET), false);
}

console.log("\n— callback signature —");
check("genuine callback verifies", verifyPaymentLinkSignature(signedCallback(), KEY_SECRET), true);

{
  // Each field is covered by the signature, so tampering with any one fails.
  const genuine = signedCallback();
  const tamper = (field: string, value: string) =>
    verifyPaymentLinkSignature({ ...genuine, [field]: value }, KEY_SECRET);

  check("tampered payment_id rejected", tamper("razorpay_payment_id", "pay_EVIL"), false);
  check("tampered link_id rejected", tamper("razorpay_payment_link_id", "plink_EVIL"), false);
  check("tampered reference_id rejected", tamper("razorpay_payment_link_reference_id", "ls-other:0000"), false);
  check("tampered status rejected", tamper("razorpay_payment_link_status", "paid "), false);
  check("tampered signature rejected", tamper("razorpay_signature", hmac("anything", KEY_SECRET)), false);
}

{
  // The attack this exists to stop: an unpaid link edited to claim "paid".
  const unpaid = signedCallback({ razorpay_payment_link_status: "created" });
  const forged = { ...unpaid, razorpay_payment_link_status: "paid" };
  check("UNPAID LINK RELABELLED AS PAID IS REJECTED", verifyPaymentLinkSignature(forged, KEY_SECRET), false);
  check("the unpaid callback itself still verifies", verifyPaymentLinkSignature(unpaid, KEY_SECRET), true);
}

check("wrong secret rejected", verifyPaymentLinkSignature(signedCallback(), "not-the-secret"), false);
check("empty secret rejected", verifyPaymentLinkSignature(signedCallback(), ""), false);
check("undefined secret rejected", verifyPaymentLinkSignature(signedCallback(), undefined), false);

{
  const genuine = signedCallback();
  check("empty signature rejected", verifyPaymentLinkSignature({ ...genuine, razorpay_signature: "" }, KEY_SECRET), false);
  check("short signature rejected, no throw", verifyPaymentLinkSignature({ ...genuine, razorpay_signature: "abcd" }, KEY_SECRET), false);
  check("non-hex signature rejected, no throw", verifyPaymentLinkSignature({ ...genuine, razorpay_signature: "z".repeat(64) }, KEY_SECRET), false);
}

console.log("\n— webhook signature —");
{
  const body = JSON.stringify({
    event: "payment_link.paid",
    payload: { payment_link: { entity: { status: "paid", notes: { reportId: "ls-1" } } } },
  });
  const signature = hmac(body, WEBHOOK_SECRET);

  check("genuine webhook verifies", verifyWebhookSignature(body, signature, WEBHOOK_SECRET), true);
  check("tampered body rejected", verifyWebhookSignature(body.replace("ls-1", "ls-2"), signature, WEBHOOK_SECRET), false);
  check("wrong secret rejected", verifyWebhookSignature(body, signature, "other-secret"), false);
  check("missing signature rejected", verifyWebhookSignature(body, "", WEBHOOK_SECRET), false);
  check("missing secret rejected", verifyWebhookSignature(body, signature, ""), false);

  // Webhooks use a different secret from callbacks; mixing them must fail.
  check("KEY SECRET DOES NOT VERIFY A WEBHOOK", verifyWebhookSignature(body, hmac(body, KEY_SECRET), WEBHOOK_SECRET), false);
}

console.log("\n— paid status —");
{
  const link = (over: Partial<PaymentLink>): PaymentLink => ({
    id: "plink_1",
    short_url: "https://rzp.io/i/abc",
    status: "paid",
    amount: 399900,
    amount_paid: 399900,
    currency: "INR",
    ...over,
  });

  check("paid and settled in full", paymentLinkIsPaid(link({})), true);
  check("status created is not paid", paymentLinkIsPaid(link({ status: "created" })), false);
  check("status cancelled is not paid", paymentLinkIsPaid(link({ status: "cancelled" })), false);
  check("status expired is not paid", paymentLinkIsPaid(link({ status: "expired" })), false);
  check("partial payment is not paid", paymentLinkIsPaid(link({ status: "partially_paid", amount_paid: 100000 })), false);
  check("paid status but short amount rejected", paymentLinkIsPaid(link({ amount_paid: 399899 })), false);
  check("overpayment still counts as paid", paymentLinkIsPaid(link({ amount_paid: 400000 })), true);
}

console.log("\n— amount and price —");
{
  const original = process.env.RAZORPAY_UNIT_AMOUNT;

  delete process.env.RAZORPAY_UNIT_AMOUNT;
  check("defaults to the placeholder amount", razorpayUnitAmount(), DEFAULT_UNIT_AMOUNT);

  process.env.RAZORPAY_UNIT_AMOUNT = "249900";
  check("env override applies", razorpayUnitAmount(), 249900);

  process.env.RAZORPAY_UNIT_AMOUNT = "50";
  check("below Razorpay's ₹1 minimum falls back", razorpayUnitAmount(), DEFAULT_UNIT_AMOUNT);

  process.env.RAZORPAY_UNIT_AMOUNT = "not-a-number";
  check("non-numeric falls back", razorpayUnitAmount(), DEFAULT_UNIT_AMOUNT);

  if (original === undefined) delete process.env.RAZORPAY_UNIT_AMOUNT;
  else process.env.RAZORPAY_UNIT_AMOUNT = original;

  // Indian digit grouping is correct for INR: ₹3,999 and ₹12,00,000.
  check("formats whole rupees", formatUnlockPrice(149900, "INR"), "₹1,499");
  check("formats lakh grouping", formatUnlockPrice(120000000, "INR"), "₹12,00,000");
  check("keeps paise when present", formatUnlockPrice(399950, "INR"), "₹3,999.50");
}

console.log(
  `\n${failures === 0 ? "All Razorpay fixtures passed." : `${failures} fixture(s) FAILED.`}`,
);
if (failures > 0) process.exit(1);
