import { createAccount, findAccountByEmail } from "@/lib/accounts";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  encodeSession,
  normalizeEmail,
  sessionCookieHeader,
  SESSION_MAX_AGE,
  validEmail,
  validPassword,
} from "@/lib/auth";

export const runtime = "nodejs";

const SIGNUP_RULE = { limit: 5, windowMs: 60 * 60 * 1000 };

export async function POST(request: Request) {
  const limited = rateLimit(clientKey(request, "signup"), SIGNUP_RULE);
  if (!limited.ok) {
    return tooManyRequests(
      limited,
      "Too many accounts created from this address. Try again later.",
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
  if (!validEmail(normalized)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!validPassword(password)) {
    return Response.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }
  if (await findAccountByEmail(normalized)) {
    return Response.json(
      { error: "An account with that email already exists." },
      { status: 409 },
    );
  }

  try {
    const account = await createAccount(normalized, password);
    const token = encodeSession({ id: account.id, email: account.email });
    return new Response(
      JSON.stringify({ user: { id: account.id, email: account.email } }),
      {
        status: 201,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": sessionCookieHeader(token, SESSION_MAX_AGE),
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create account";
    return Response.json({ error: message }, { status: 400 });
  }
}
