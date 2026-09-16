import { getReport } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const report = await getReport(id);
  if (!report) {
    return Response.json({ error: "Report not found" }, { status: 404 });
  }
  return Response.json(report);
}
