"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { saveReportLocal } from "@/lib/client-store";
import { parseSampleUrls } from "@/lib/urls";
import type { EstimateReport, MigrationTarget } from "@/lib/types";
import { TARGET_LABELS } from "@/lib/types";

const TARGETS: MigrationTarget[] = [
  "aemaacs-upgrade",
  "aem-to-other",
  "other-to-aem",
];

export function EstimateForm() {
  const router = useRouter();
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [sitemapXml, setSitemapXml] = useState("");
  const [fileName, setFileName] = useState("");
  const [samplePages, setSamplePages] = useState("");
  const [target, setTarget] = useState<MigrationTarget>("aemaacs-upgrade");
  const [siteCount, setSiteCount] = useState("1");
  const [languageCount, setLanguageCount] = useState("1");
  const [customComponentCount, setCustomComponentCount] = useState("12");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"form" | "demo" | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 2_000_000) {
      setError("Sitemap file must be under 2MB.");
      return;
    }
    const text = await file.text();
    setSitemapXml(text);
    setFileName(file.name);
    setError(null);
  }

  async function submit(demo: boolean) {
    setError(null);
    setPending(demo ? "demo" : "form");
    try {
      const payload = demo
        ? { demo: true }
        : {
            sitemapUrl: sitemapUrl.trim() || undefined,
            sitemapXml: sitemapXml.trim() || undefined,
            samplePageUrls: parseSampleUrls(samplePages),
            target,
            siteCount: Number(siteCount),
            languageCount: Number(languageCount),
            customComponentCount: Number(customComponentCount),
          };

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as EstimateReport & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Analysis failed");
      }
      saveReportLocal(data);
      router.push(`/report/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to run estimate");
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Estimate could not start</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Inventory</CardTitle>
          <CardDescription>
            Paste a public sitemap, a homepage, or upload XML. We fingerprint
            the CMS from HTML even when it is not AEM. If the crawl fails, we
            still score from the scale fields below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sitemap-url">Sitemap or site URL</Label>
            <Input
              id="sitemap-url"
              type="url"
              inputMode="url"
              placeholder="https://www.example.com/sitemap.xml"
              value={sitemapUrl}
              onChange={(event) => setSitemapUrl(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A homepage works if you do not have a sitemap. Sampled HTML is
              checked for WordPress, Drupal, Sitecore, Shopify, Webflow,
              headless, AEM, and other fingerprints.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sitemap-file">Or upload sitemap XML</Label>
            <div className="flex items-center gap-3">
              <Input
                id="sitemap-file"
                type="file"
                accept=".xml,text/xml,application/xml,.gz"
                className="cursor-pointer"
                onChange={(event) => onFile(event.target.files?.[0])}
              />
            </div>
            {fileName && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Upload className="size-3.5" />
                {fileName} loaded ({Math.round(sitemapXml.length / 1024)} KB)
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="sample-pages">
              Sample page URLs{" "}
              <span className="font-normal text-muted-foreground">
                (optional, up to 20)
              </span>
            </Label>
            <Textarea
              id="sample-pages"
              rows={4}
              placeholder={"https://www.example.com/\nhttps://www.example.com/contact"}
              value={samplePages}
              onChange={(event) => setSamplePages(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Comma or newline separated. We fetch a polite sample to classify
              templates, integration smells, and the source stack.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Target and scale</CardTitle>
          <CardDescription>
            These fields drive the score even when the sitemap is empty or
            blocked.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="target">Migration target</Label>
            <select
              id="target"
              value={target}
              onChange={(event) =>
                setTarget(event.target.value as MigrationTarget)
              }
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {TARGETS.map((value) => (
                <option key={value} value={value}>
                  {TARGET_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField
              id="sites"
              label="Number of sites"
              value={siteCount}
              min={1}
              onChange={setSiteCount}
            />
            <NumberField
              id="languages"
              label="Languages"
              value={languageCount}
              min={1}
              onChange={setLanguageCount}
            />
            <NumberField
              id="components"
              label="Custom components"
              value={customComponentCount}
              min={0}
              onChange={setCustomComponentCount}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={pending !== null}
          onClick={() => submit(true)}
          className="w-full sm:w-auto"
        >
          {pending === "demo" && <Loader2 className="animate-spin" />}
          Try sample estimate
        </Button>
        <Button
          type="button"
          size="lg"
          disabled={pending !== null}
          onClick={() => submit(false)}
          className="w-full sm:w-auto"
        >
          {pending === "form" && <Loader2 className="animate-spin" />}
          {pending === "form"
            ? "Analyzing sitemap and pages…"
            : "Generate estimate"}
        </Button>
      </div>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  min: number;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
