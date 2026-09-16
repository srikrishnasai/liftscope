"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  TIGHTEN_EXTRAS,
  TIGHTEN_QUESTIONS,
  emptyTighten,
  tightenActive,
  type TightenAnswers,
  type TightenExtra,
  type TightenKey,
} from "@/lib/tighten";

export function TightenBand({
  value,
  onChange,
}: {
  value: TightenAnswers;
  onChange: (next: TightenAnswers) => void;
}) {
  const active = tightenActive(value);

  function setKey(key: TightenKey, next: TightenAnswers[TightenKey]) {
    onChange({ ...value, [key]: next });
  }

  function toggleExtra(id: TightenExtra, checked: boolean) {
    const extras = checked
      ? [...new Set([...value.extras, id])]
      : value.extras.filter((item) => item !== id);
    onChange({ ...value, extras });
  }

  return (
    <section className="print-break space-y-4 rounded-xl border bg-card p-5 ring-1 ring-foreground/5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-heading text-2xl tracking-tight">
            Tighten the band
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Facts a sitemap cannot see. Answer only what you know — each
            choice adds a driver, and some stretch the person-week range.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="no-print"
          disabled={!active}
          onClick={() => onChange(emptyTighten())}
        >
          Clear answers
        </Button>
      </div>

      <ol className="space-y-5">
        {TIGHTEN_QUESTIONS.map((question, index) => (
          <li key={question.key} className="space-y-2">
            <p className="text-sm font-medium">
              <span className="mr-2 text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              {question.title}
            </p>
            <p className="text-xs text-muted-foreground">{question.body}</p>
            <div className="space-y-1.5">
              {question.options.map((option) => (
                <label
                  key={option.value}
                  className="flex items-start gap-2 rounded-lg border px-2.5 py-2 text-sm"
                >
                  <input
                    type="radio"
                    className="mt-1 accent-primary"
                    name={`tighten-${question.key}`}
                    checked={value[question.key] === option.value}
                    onChange={() => setKey(question.key, option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </li>
        ))}
      </ol>

      <div className="space-y-2">
        <Label>Scope that stretches the calendar</Label>
        <div className="space-y-2">
          {TIGHTEN_EXTRAS.map((extra) => (
            <label
              key={extra.id}
              className="flex items-start gap-2 rounded-lg border px-2.5 py-2 text-sm"
            >
              <input
                type="checkbox"
                className="mt-1 size-3.5 accent-primary"
                checked={value.extras.includes(extra.id)}
                onChange={(event) =>
                  toggleExtra(extra.id, event.target.checked)
                }
              />
              <span>
                <span className="font-medium">{extra.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {extra.hint}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
