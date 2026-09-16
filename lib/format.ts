export function formatWeeks(n: number): string {
  return `${n} person-week${n === 1 ? "" : "s"}`;
}

/**
 * Thousands grouping pinned to en-US.
 *
 * Bare `toLocaleString()` follows the *server's* locale, so the same report
 * rendered on an en-IN host reads "8,75,000" instead of "875,000". Report text
 * is meant to be deterministic, and a server/client locale split also risks a
 * hydration mismatch.
 */
export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function severityLabel(severity: "high" | "medium" | "low"): string {
  if (severity === "high") return "High";
  if (severity === "medium") return "Medium";
  return "Low";
}

export function confidenceLabel(
  confidence: "high" | "medium" | "low" | "none",
): string {
  if (confidence === "high") return "High confidence";
  if (confidence === "medium") return "Medium confidence";
  if (confidence === "low") return "Low confidence";
  return "Not identified";
}
