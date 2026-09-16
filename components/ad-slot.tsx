import { Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

export type AdPlacement = "left" | "right" | "mobile";

const COPY: Record<
  AdPlacement,
  { label: string; size: string; hint: string }
> = {
  left: {
    label: "Left rail",
    size: "160 × 600",
    hint: "Wide skyscraper. Replace this placeholder with your ad tag.",
  },
  right: {
    label: "Right rail",
    size: "160 × 600",
    hint: "Wide skyscraper. Replace this placeholder with your ad tag.",
  },
  mobile: {
    label: "Mobile banner",
    size: "320 × 50",
    hint: "Shown when the side rails collapse. Same inventory, compact placement.",
  },
};

export function AdSlot({
  placement,
  className,
}: {
  placement: AdPlacement;
  className?: string;
}) {
  const copy = COPY[placement];
  const rail = placement === "left" || placement === "right";

  return (
    <aside
      data-ad-slot={placement}
      aria-label={`Advertisement, ${copy.label}`}
      className={cn(
        "no-print rounded-xl border border-dashed border-border bg-muted/30 text-center",
        rail
          ? "sticky top-16 flex h-[600px] w-[160px] flex-col items-center justify-center px-3 py-4"
          : "flex min-h-[50px] w-full items-center justify-center gap-3 px-4 py-3",
        className,
      )}
    >
      <Megaphone className="size-4 text-muted-foreground" aria-hidden />
      <div className={rail ? "mt-3 space-y-1" : "space-y-0.5 text-left"}>
        <p className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          Advertisement
        </p>
        <p className="text-xs font-medium">{copy.label}</p>
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {copy.size}
        </p>
        {rail && (
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            {copy.hint}
          </p>
        )}
      </div>
    </aside>
  );
}
