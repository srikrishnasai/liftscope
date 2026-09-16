import {
  findAccountById,
  listUnlocksForUser,
  publicAccount,
} from "@/lib/accounts";
import { readSessionCookie } from "@/lib/auth";
import { getReport } from "@/lib/store";
import { TARGET_LABELS } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = readSessionCookie(request);
  if (!session) {
    return Response.json({ user: null });
  }
  const account = await findAccountById(session.id);
  if (!account) {
    return Response.json({ user: null });
  }
  const rows = await listUnlocksForUser(account.id);
  const unlocks = await Promise.all(
    rows.map(async (row) => {
      const report = await getReport(row.reportId);
      return {
        reportId: row.reportId,
        source: row.source,
        at: row.at,
        available: Boolean(report),
        target: report ? TARGET_LABELS[report.input.target] : null,
      };
    }),
  );
  return Response.json({ user: publicAccount(account), unlocks });
}
