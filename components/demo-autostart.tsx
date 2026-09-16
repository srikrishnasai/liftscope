"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { saveReportLocal } from "@/lib/client-store";
import type { EstimateReport } from "@/lib/types";

export function DemoAutostart() {
  const params = useSearchParams();
  const router = useRouter();
  const [running, setRunning] = useState(params.get("demo") === "1");

  useEffect(() => {
    if (params.get("demo") !== "1") return;
    let cancelled = false;
    fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demo: true }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("demo failed");
        return (await response.json()) as EstimateReport;
      })
      .then((report) => {
        if (cancelled) return;
        saveReportLocal(report);
        router.replace(`/report/${report.id}`);
      })
      .catch(() => {
        if (!cancelled) setRunning(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params, router]);

  if (!running) return null;

  return (
    <p className="mb-6 rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
      Running the Northline Financial sample estimate…
    </p>
  );
}
