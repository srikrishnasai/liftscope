"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildTemplateMemo, memoFingerprint, type ClientMemo } from "@/lib/memo";
import type { TightenAnswers } from "@/lib/tighten";
import type { EstimateReport } from "@/lib/types";

export function ClientMemo({
  report,
  tighten,
}: {
  report: EstimateReport;
  tighten: TightenAnswers;
}) {
  const [memo, setMemo] = useState<ClientMemo | null>(null);
  const [ai, setAi] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);
  const [pending, setPending] = useState<"draft" | "polish" | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fingerprint = memoFingerprint(report);
  const stale = Boolean(memo && memo.fingerprint !== fingerprint);

  useEffect(() => {
    fetch("/api/memo")
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as {
          ai?: boolean;
          provider?: string | null;
        };
        setAi(Boolean(data.ai));
        setProvider(data.provider ?? null);
      })
      .catch(() => {
        setAi(false);
      });
  }, []);

  function draft() {
    setError(null);
    setPending("draft");
    setMemo(buildTemplateMemo(report, tighten));
    setPending(null);
  }

  async function polish() {
    setError(null);
    setPending("polish");
    try {
      const response = await fetch("/api/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report, tighten, polish: true }),
      });
      const data = (await response.json()) as ClientMemo & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Could not polish memo");
      }
      setMemo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not polish memo");
      setMemo(buildTemplateMemo(report, tighten));
    } finally {
      setPending(null);
    }
  }

  async function copy() {
    if (!memo) return;
    try {
      await navigator.clipboard.writeText(memo.markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy memo", memo.markdown);
    }
  }

  return (
    <section className="print-break space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-heading text-2xl tracking-tight">Client memo</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A one-page write-up of the current rubric numbers. Optional polish
            (Hugging Face or OpenAI) may only rephrase — it cannot change the
            score.
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending !== null}
            onClick={draft}
          >
            {pending === "draft" && <Loader2 className="animate-spin" />}
            Draft memo
          </Button>
          {ai && (
            <Button
              type="button"
              size="sm"
              disabled={pending !== null}
              onClick={polish}
            >
              {pending === "polish" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Sparkles />
              )}
              {provider === "huggingface"
                ? "Polish with Hugging Face"
                : "Polish with AI"}
            </Button>
          )}
          {memo && (
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy memo"}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {stale && memo && (
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Assumptions changed after this draft. Draft again to match complexity{" "}
          {report.score.complexity}/10 and mid-case {report.effort.mid}{" "}
          person-weeks.
        </p>
      )}

      {!memo && (
        <p className="text-sm text-muted-foreground">
          Unlock already includes the working papers. Draft a memo when you
          want something you can paste into email or a SOW appendix.
        </p>
      )}

      {memo && (
        <article className="rounded-xl border bg-card p-5 ring-1 ring-foreground/5">
          <p className="mb-4 text-xs tracking-[0.14em] text-muted-foreground uppercase">
            {memo.source === "ai"
              ? `AI polished (${provider ?? "model"}) · numbers from rubric`
              : "Rubric template"}
            {memo.warning ? ` · ${memo.warning}` : ""}
          </p>
          <MemoMarkdown markdown={memo.markdown} />
        </article>
      )}
    </section>
  );
}

function MemoMarkdown({ markdown }: { markdown: string }) {
  const blocks = markdown.trim().split(/\n{2,}/);
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {blocks.map((block, index) => {
        if (block.startsWith("# ")) {
          return (
            <h3 key={index} className="font-heading text-2xl tracking-tight">
              {block.slice(2)}
            </h3>
          );
        }
        if (block.startsWith("## ")) {
          return (
            <h4 key={index} className="font-heading text-lg tracking-tight">
              {block.slice(3)}
            </h4>
          );
        }
        if (block.startsWith("_") && block.endsWith("_")) {
          return (
            <p key={index} className="text-xs text-muted-foreground">
              {block.slice(1, -1)}
            </p>
          );
        }
        const lines = block.split("\n");
        if (lines.every((line) => line.startsWith("- "))) {
          return (
            <ul
              key={index}
              className="list-disc space-y-1.5 pl-5 text-muted-foreground"
            >
              {lines.map((line) => (
                <li key={line}>
                  <InlineText text={line.slice(2)} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} className="text-muted-foreground">
            <InlineText text={block} />
          </p>
        );
      })}
    </div>
  );
}

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={index} className="font-medium text-foreground">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}
