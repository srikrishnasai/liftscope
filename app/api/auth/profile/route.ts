import {
  findAccountById,
  publicAccount,
  updateDisplayName,
} from "@/lib/accounts";
import { readSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const session = readSessionCookie(request);
  if (!session) {
    return Response.json({ error: "Sign in to edit your profile." }, { status: 401 });
  }
  const account = await findAccountById(session.id);
  if (!account) {
    return Response.json({ error: "Account not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name =
    body && typeof body === "object" && "name" in body
      ? String((body as { name?: unknown }).name ?? "")
      : "";

  const updated = await updateDisplayName(session.id, name);
  return Response.json({ user: publicAccount(updated) });
}
