import { userHasUnlock } from "@/lib/accounts";
import { readSessionCookie } from "@/lib/auth";
import { isStripeConfigured } from "@/lib/stripe";
import { isReportUnlocked } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const user = readSessionCookie(request);
  const stripe = isStripeConfigured();

  if (!stripe) {
    return Response.json({
      unlocked: await isReportUnlocked(id),
      gate: "open",
      user: user ? { email: user.email } : null,
    });
  }

  if (!user) {
    return Response.json({
      unlocked: false,
      gate: "login",
      user: null,
    });
  }

  const paid = await userHasUnlock(user.id, id);
  return Response.json({
    unlocked: paid,
    gate: paid ? "open" : "pay",
    user: { email: user.email },
  });
}
