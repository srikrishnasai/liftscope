import { changePassword, findAccountById } from "@/lib/accounts";
import { readSessionCookie, validPassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = readSessionCookie(request);
  if (!session) {
    return Response.json({ error: "Sign in to change password." }, { status: 401 });
  }
  if (!(await findAccountById(session.id))) {
    return Response.json({ error: "Account not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const currentPassword =
    body && typeof body === "object" && "currentPassword" in body
      ? String((body as { currentPassword?: unknown }).currentPassword ?? "")
      : "";
  const nextPassword =
    body && typeof body === "object" && "nextPassword" in body
      ? String((body as { nextPassword?: unknown }).nextPassword ?? "")
      : "";

  if (!validPassword(nextPassword)) {
    return Response.json(
      { error: "New password must be at least 8 characters." },
      { status: 400 },
    );
  }

  try {
    await changePassword(session.id, currentPassword, nextPassword);
    return Response.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not change password";
    const status = message.includes("incorrect") ? 401 : 400;
    return Response.json({ error: message }, { status });
  }
}
