"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ReportView } from "@/components/report-view";
import { buttonVariants } from "@/components/ui/button";
import { loadReportLocal, saveReportLocal } from "@/lib/client-store";
import type { EstimateReport } from "@/lib/types";

export function ReportClient({
  id,
  initialReport,
}: {
  id: string;
  initialReport: EstimateReport | null;
}) {
  const [report, setReport] = useState<EstimateReport | null>(initialReport);
  const [status, setStatus] = useState<"ready" | "loading" | "missing">(
    initialReport ? "ready" : "loading",
  );

  useEffect(() => {
    if (initialReport) {
      saveReportLocal(initialReport);
      return;
    }
    const local = loadReportLocal(id);
    if (local) {
      setReport(local);
      setStatus("ready");
      return;
    }
    let cancelled = false;
    fetch(`/api/reports/${id}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("missing");
        return (await response.json()) as EstimateReport;
      })
      .then((data) => {
        if (cancelled) return;
        saveReportLocal(data);
        setReport(data);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [id, initialReport]);

  if (status === "loading") {
    return (
      <p className="text-sm text-muted-foreground">Loading report {id}…</p>
    );
  }

  if (status === "missing" || !report) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
        <h1 className="font-heading text-3xl tracking-tight">
          Report not found
        </h1>
        <p className="text-sm text-muted-foreground">
          This id is not in this browser session or the current server memory.
          In-memory reports reset when the process restarts — run a new estimate
          or retry the sample path.
        </p>
        <Link href="/estimate" className={buttonVariants()}>
          Start a new estimate
        </Link>
      </div>
    );
  }

  return <ReportView report={report} />;
}
