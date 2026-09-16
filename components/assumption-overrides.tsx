"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SIGNAL_LABELS,
  normalizeOverrides,
  overridesDiffer,
} from "@/lib/overrides";
import type { AssumptionOverrides, IntegrationSignal, MigrationTarget } from "@/lib/types";
import { INTEGRATION_SIGNALS, TARGET_LABELS } from "@/lib/types";

export function AssumptionOverridesPanel({
  baseline,
  value,
  onChange,
  sensitivity,
}: {
  baseline: AssumptionOverrides;
  value: AssumptionOverrides;
  onChange: (next: AssumptionOverrides) => void;
  sensitivity: string;
}) {
  const dirty = overridesDiffer(value, baseline);

  function patch(partial: Partial<AssumptionOverrides>) {
    onChange(normalizeOverrides({ ...value, ...partial }));
  }

  function toggleSignal(signal: IntegrationSignal, checked: boolean) {
    const next = checked
      ? [...new Set([...value.signals, signal])]
      : value.signals.filter((item) => item !== signal);
    patch({ signals: next });
  }

  return (
    <section className="print-break space-y-4 rounded-xl border bg-card p-5 ring-1 ring-foreground/5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-heading text-2xl tracking-tight">
            Adjust assumptions
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Recalculates the same rubric instantly. Use this on a scoping call
            when the sitemap or brief is incomplete.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="no-print"
          disabled={!dirty}
          onClick={() => onChange(normalizeOverrides(baseline))}
        >
          Reset to original
        </Button>
      </div>

      <p
        className={
          dirty
            ? "rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm"
            : "rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
        }
      >
        {sensitivity}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NumberField
          id="override-pages"
          label="Page count"
          value={value.pageCount}
          min={1}
          onChange={(pageCount) => patch({ pageCount })}
        />
        <NumberField
          id="override-sites"
          label="Sites"
          value={value.siteCount}
          min={1}
          onChange={(siteCount) => patch({ siteCount })}
        />
        <NumberField
          id="override-langs"
          label="Languages"
          value={value.languageCount}
          min={1}
          onChange={(languageCount) => patch({ languageCount })}
        />
        <NumberField
          id="override-components"
          label="Custom components"
          value={value.customComponentCount}
          min={0}
          onChange={(customComponentCount) => patch({ customComponentCount })}
        />
        <NumberField
          id="override-forms"
          label="Form-heavy %"
          value={value.formHeavyPct}
          min={0}
          max={100}
          onChange={(formHeavyPct) => patch({ formHeavyPct })}
        />
        <div className="space-y-2">
          <Label htmlFor="override-target">Migration target</Label>
          <select
            id="override-target"
            value={value.target}
            onChange={(event) =>
              patch({ target: event.target.value as MigrationTarget })
            }
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {(Object.keys(TARGET_LABELS) as MigrationTarget[]).map((key) => (
              <option key={key} value={key}>
                {TARGET_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Known integrations</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {INTEGRATION_SIGNALS.map((signal) => (
            <label
              key={signal}
              className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm"
            >
              <input
                type="checkbox"
                className="size-3.5 accent-primary"
                checked={value.signals.includes(signal)}
                onChange={(event) => toggleSignal(signal, event.target.checked)}
              />
              {SIGNAL_LABELS[signal]}
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
