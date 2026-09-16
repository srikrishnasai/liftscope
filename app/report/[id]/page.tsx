import { SiteShell } from "@/components/site-shell";
import { getReport } from "@/lib/store";
import { ReportClient } from "./report-client";

export const metadata = {
  title: "Report · LiftScope",
  description: "LiftScope migration complexity report.",
};

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const initialReport = (await getReport(id)) ?? null;

  return (
    <SiteShell compact>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        <ReportClient id={id} initialReport={initialReport} />
      </main>
    </SiteShell>
  );
}
