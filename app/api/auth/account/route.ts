import { deleteAccount } from "@/lib/accounts";
import { clearSessionCookieHeader, readSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  const session = readSessionCookie(request);
  if (!session) {
    return Response.json({ error: "Sign in to delete this account." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const password =
    body && typeof body === "object" && "password" in body
      ? String((body as { password?: unknown }).password ?? "")
      : "";

  if (!password) {
    return Response.json(
      { error: "Password is required to delete the account." },
      { status: 400 },
    );
  }

  try {
    await deleteAccount(session.id, password);
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": clearSessionCookieHeader(),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not delete account";
    const status = message.includes("incorrect") ? 401 : 400;
    return Response.json({ error: message }, { status });
  }
}
