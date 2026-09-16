import { findAccountById, publicAccount, updateEmail } from "@/lib/accounts";
import {
  encodeSession,
  normalizeEmail,
  readSessionCookie,
  sessionCookieHeader,
  SESSION_MAX_AGE,
  validEmail,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const session = readSessionCookie(request);
  if (!session) {
    return Response.json({ error: "Sign in to change email." }, { status: 401 });
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
  if (!password) {
    return Response.json(
      { error: "Current password is required to change email." },
      { status: 400 },
    );
  }

  try {
    const updated = await updateEmail(session.id, normalized, password);
    const token = encodeSession({ id: updated.id, email: updated.email });
    return new Response(JSON.stringify({ user: publicAccount(updated) }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": sessionCookieHeader(token, SESSION_MAX_AGE),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update email";
    const status = message.includes("incorrect") ? 401 : 400;
    return Response.json({ error: message }, { status });
  }
}
