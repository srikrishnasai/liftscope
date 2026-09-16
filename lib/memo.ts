import { formatDate } from "./format";
import {
  TIGHTEN_EXTRAS,
  TIGHTEN_QUESTIONS,
  type TightenAnswers,
} from "./tighten";
import { stackAlignment, stackIsActionable } from "./detect-stack";
import { TARGET_LABELS, type EstimateReport } from "./types";

export interface ClientMemo {
  source: "template" | "ai";
  markdown: string;
  fingerprint: string;
  warning?: string;
}

export function memoFingerprint(report: EstimateReport): string {
  return [
    report.score.complexity,
    report.score.raw,
    report.effort.low,
    report.effort.mid,
    report.effort.high,
    report.score.drivers.map((d) => `${d.id}:${d.points}`).join(","),
  ].join("|");
}

export function nextQuestions(
  report: EstimateReport,
  tighten?: TightenAnswers,
): string[] {
  const items: string[] = [];

  if (tighten) {
    for (const question of TIGHTEN_QUESTIONS) {
      if (tighten[question.key] === "not_assessed") {
        items.push(`Still open: ${question.title} — ${question.body}`);
      }
    }
    const missingExtras = TIGHTEN_EXTRAS.filter(
      (extra) => !tighten.extras.includes(extra.id),
    );
    if (missingExtras.length === 3) {
      items.push(
        "Confirm whether commerce/PIM, a hard deadline, or a security/regulatory review is in scope — those stretch the calendar more than page count.",
      );
    }
  } else {
    items.push(
      "Walk the Tighten the band questions (components, forms, identity, personalization, locales) before treating mid-case as a bid.",
    );
  }

  if (report.sitemap.urlCount === 0 || report.sitemap.source === "none") {
    items.push(
      "Get a complete sitemap or Cloud Manager package export so page count is measured, not assumed.",
    );
  }
  if (report.crawl.degraded) {
    items.push(
      "Re-sample live templates (or a package) — this pass could not see enough HTML to trust integration mix.",
    );
  }
  const stackId = report.crawl.stack?.primary?.id;
  const alignment = stackAlignment(stackId, report.input.target);
  if (stackIsActionable(report.crawl.stack) && alignment === "mismatch" && report.crawl.stack?.primary) {
    items.push(
      `Confirm whether the live estate is ${report.crawl.stack.primary.label} or ${TARGET_LABELS[report.input.target]} — HTML fingerprints and the selected target disagree.`,
    );
  } else if (!stackIsActionable(report.crawl.stack) && !report.crawl.degraded) {
    items.push(
      "Confirm the source CMS on a production authoring login — HTML fingerprints did not identify a CMS with enough confidence to score.",
    );
  }
  if (
    report.input.customComponentCount > 0 &&
    (!tighten || tighten.components === "not_assessed")
  ) {
    items.push(
      `Ask which of the ${report.input.customComponentCount} custom components are unused vs. must be rebuilt net-new.`,
    );
  }

  return items.slice(0, 6);
}

export function buildTemplateMemo(
  report: EstimateReport,
  tighten?: TightenAnswers,
): ClientMemo {
  const target = TARGET_LABELS[report.input.target];
  const { complexity } = report.score;
  const { low, mid, high } = report.effort;
  const ask = nextQuestions(report, tighten);
  const risks = report.risks.slice(0, 6);
  const drivers = report.score.drivers.slice(0, 8);

  const markdown = [
    `# LiftScope estimate memo`,
    ``,
    `**${target}** · ${formatDate(report.createdAt)} · ${report.id}`,
    ...(report.input.demo
      ? [`Sample fixture (Northline Financial) — not a live client estate.`, ``]
      : []),
    `## Recommendation`,
    ``,
    report.score.narrative,
    ``,
    `Planning band: **${low}–${high} person-weeks** (mid-case **${mid}**). Complexity **${complexity}/10** from rubric ${report.rubricVersion}. This is a scoping range, not a fixed bid.`,
    ``,
    `## What drives the number`,
    ``,
    ...drivers.map(
      (driver) =>
        `- **${driver.label}** (${driver.points >= 0 ? "+" : ""}${driver.points.toFixed(1)}): ${driver.detail}`,
    ),
    ``,
    `## Risks to put on the SOW`,
    ``,
    ...risks.map(
      (risk) => `- **${risk.title}** (${risk.severity}): ${risk.explanation}`,
    ),
    ``,
    `## Shape of work`,
    ``,
    ...report.plan.map(
      (phase) =>
        `- **${phase.name}** (${phase.weeks.low}–${phase.weeks.high} person-weeks): ${phase.bullets[0]}`,
    ),
    ``,
    `## Ask the client next`,
    ``,
    ...(ask.length
      ? ask.map((item) => `- ${item}`)
      : ["- Discovery answers are complete enough to take this band into a scoping call."]),
    ``,
    `## Standing assumptions`,
    ``,
    ...report.assumptions.slice(0, 6).map((item) => `- ${item}`),
    ``,
    `_Numbers are produced by the LiftScope rubric. Do not treat the narrative as a substitute for the score._`,
  ].join("\n");

  return {
    source: "template",
    markdown,
    fingerprint: memoFingerprint(report),
  };
}

export function sanitizeReportForModel(report: EstimateReport) {
  return {
    id: report.id,
    createdAt: report.createdAt,
    rubricVersion: report.rubricVersion,
    target: TARGET_LABELS[report.input.target],
    siteCount: report.input.siteCount,
    languageCount: report.input.languageCount,
    customComponentCount: report.input.customComponentCount,
    demo: Boolean(report.input.demo),
    sitemap: {
      source: report.sitemap.source,
      urlCount: report.sitemap.urlCount,
      parseError: report.sitemap.parseError ?? null,
    },
    crawl: {
      degraded: report.crawl.degraded,
      notes: report.crawl.notes,
      signals: report.crawl.signals,
      formHeavyPct: report.crawl.formHeavyPct,
      classMix: report.crawl.classMix,
      stack: report.crawl.stack
        ? {
            primary: report.crawl.stack.primary,
            others: report.crawl.stack.others,
            confidence: report.crawl.stack.confidence,
            summary: report.crawl.stack.summary,
          }
        : null,
    },
    score: {
      complexity: report.score.complexity,
      raw: report.score.raw,
      narrative: report.score.narrative,
      drivers: report.score.drivers,
    },
    effort: report.effort,
    risks: report.risks.map((risk) => ({
      id: risk.id,
      title: risk.title,
      explanation: risk.explanation,
      severity: risk.severity,
    })),
    plan: report.plan.map((phase) => ({
      name: phase.name,
      weeks: phase.weeks,
      bullets: phase.bullets,
    })),
    assumptions: report.assumptions,
    whatWouldChange: report.whatWouldChange,
  };
}

export function memoKeepsNumbers(
  markdown: string,
  report: EstimateReport,
): boolean {
  const text = markdown.replace(/,/g, "");
  const { complexity } = report.score;
  const { low, mid, high } = report.effort;
  return (
    text.includes(String(complexity)) &&
    text.includes(String(mid)) &&
    text.includes(String(low)) &&
    text.includes(String(high))
  );
}
