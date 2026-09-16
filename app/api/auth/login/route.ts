import {
  burnPasswordCompare,
  findAccountByEmail,
  verifyPassword,
} from "@/lib/accounts";
import {
  clientKey,
  rateLimit,
  rateLimitHeaders,
  tooManyRequests,
} from "@/lib/rate-limit";
import {
  encodeSession,
  normalizeEmail,
  sessionCookieHeader,
  SESSION_MAX_AGE,
  validEmail,
} from "@/lib/auth";

export const runtime = "nodejs";

const LOGIN_RULE = { limit: 10, windowMs: 15 * 60 * 1000 };

export async function POST(request: Request) {
  const limited = rateLimit(clientKey(request, "login"), LOGIN_RULE);
  if (!limited.ok) {
    return tooManyRequests(
      limited,
      "Too many sign-in attempts. Wait a few minutes and try again.",
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email =
    body && typeof body === "object" && "email" in body
      ? String((body as { email?: unknown }).email ?? "")
      : "";
  const password =
    body && typeof body === "object" && "password" in body
      ? String((body as { password?: unknown }).password ?? "")
      : "";

  const normalized = normalizeEmail(email);
  if (!validEmail(normalized) || !password) {
    return Response.json({ error: "Email and password are required." }, { status: 400 });
  }

  const account = await findAccountByEmail(normalized);
  // Burn a comparable amount of time when the email is unknown so response
  // latency does not reveal which addresses have accounts.
  const ok = account
    ? await verifyPassword(account, password)
    : await burnPasswordCompare(password);
  if (!account || !ok) {
    return Response.json(
      { error: "Incorrect email or password." },
      { status: 401, headers: rateLimitHeaders(limited) },
    );
  }

  const token = encodeSession({ id: account.id, email: account.email });
  return new Response(
    JSON.stringify({ user: { id: account.id, email: account.email } }),
    {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": sessionCookieHeader(token, SESSION_MAX_AGE),
      },
    },
  );
}
