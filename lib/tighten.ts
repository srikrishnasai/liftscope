import type { Risk, ScoreAdjustments, ScoreDriver } from "./types";

export const TIGHTEN_KEYS = [
  "components",
  "forms",
  "identity",
  "personalization",
  "locales",
] as const;

export type TightenKey = (typeof TIGHTEN_KEYS)[number];

export type TightenExtra =
  | "commerce_pim"
  | "parallel_deadline"
  | "regulatory";

export interface TightenAnswers {
  components: "not_assessed" | "as_given" | "some_unused" | "many_rebuild";
  forms: "not_assessed" | "not_material" | "known_endpoints" | "unknown_vendors";
  identity: "not_assessed" | "public" | "documented_sso" | "gated_unproven";
  personalization:
    | "not_assessed"
    | "none"
    | "few_activities"
    | "heavy_program";
  locales: "not_assessed" | "inherited" | "mixed" | "reauthored";
  extras: TightenExtra[];
}

export const EMPTY_TIGHTEN: TightenAnswers = {
  components: "not_assessed",
  forms: "not_assessed",
  identity: "not_assessed",
  personalization: "not_assessed",
  locales: "not_assessed",
  extras: [],
};

export const TIGHTEN_EXTRAS: {
  id: TightenExtra;
  label: string;
  hint: string;
}[] = [
  {
    id: "commerce_pim",
    label: "Commerce / PIM is in scope",
    hint: "Catalog, pricing, or cart templates are a separate workstream",
  },
  {
    id: "parallel_deadline",
    label: "Hard deadline / parallel site streams",
    hint: "More people, more coordination — not just more weeks on one pod",
  },
  {
    id: "regulatory",
    label: "Regulatory or security review",
    hint: "Extra environments, evidence, and freeze windows",
  },
];

export const TIGHTEN_QUESTIONS: {
  key: TightenKey;
  title: string;
  body: string;
  options: { value: TightenAnswers[TightenKey]; label: string }[];
}[] = [
  {
    key: "components",
    title: "Custom component catalog",
    body: "Sitemaps cannot see unused dialogs or net-new rebuilds.",
    options: [
      { value: "not_assessed", label: "Not assessed yet" },
      { value: "as_given", label: "Count is accurate — map what exists" },
      { value: "some_unused", label: "About a quarter are unused or deprecated" },
      { value: "many_rebuild", label: "Many must be designed and built net-new" },
    ],
  },
  {
    key: "forms",
    title: "Forms and lead-gen",
    body: "Hidden fields and CRM endpoints are the usual go-live defects.",
    options: [
      { value: "not_assessed", label: "Not assessed yet" },
      { value: "not_material", label: "Forms are not material to this move" },
      { value: "known_endpoints", label: "Lead-gen exists; endpoints are documented" },
      { value: "unknown_vendors", label: "Several vendors, or endpoints are unknown" },
    ],
  },
  {
    key: "identity",
    title: "Identity and gated content",
    body: "Login walls never show up cleanly in a public sitemap.",
    options: [
      { value: "not_assessed", label: "Not assessed yet" },
      { value: "public", label: "Public site — no SSO in scope" },
      { value: "documented_sso", label: "SSO exists and is documented" },
      { value: "gated_unproven", label: "SSO plus gated pages, not proven in lower env" },
    ],
  },
  {
    key: "personalization",
    title: "Personalization and experiments",
    body: "Activities live in Target / Optimizely, not in the URL list.",
    options: [
      { value: "not_assessed", label: "Not assessed yet" },
      { value: "none", label: "No personalization program" },
      { value: "few_activities", label: "A handful of activities we can export" },
      { value: "heavy_program", label: "Heavy program — audiences and offers in flight" },
    ],
  },
  {
    key: "locales",
    title: "How locales are produced",
    body: "Inherited live copies are cheaper than fully re-authored language sites.",
    options: [
      { value: "not_assessed", label: "Not assessed yet" },
      { value: "inherited", label: "Mostly inherited / translated live copies" },
      { value: "mixed", label: "Mix of inherited and locally authored" },
      { value: "reauthored", label: "Locales are largely re-authored" },
    ],
  },
];

const POINT_TABLE: Record<
  TightenKey,
  Partial<Record<string, { points: number; detail: string }>>
> = {
  components: {
    as_given: {
      points: 0,
      detail: "Component count taken as a mapping exercise, not a rebuild",
    },
    some_unused: {
      points: -0.3,
      detail: "Roughly a quarter of the catalog can be dropped or deferred",
    },
    many_rebuild: {
      points: 0.8,
      detail: "A large share of components are net-new, not a 1:1 port",
    },
  },
  forms: {
    not_material: {
      points: 0,
      detail: "Forms confirmed out of material scope",
    },
    known_endpoints: {
      points: 0.2,
      detail: "Lead-gen exists but endpoints are documented",
    },
    unknown_vendors: {
      points: 0.7,
      detail: "Form/CRM surface is unknown or multi-vendor",
    },
  },
  identity: {
    public: { points: 0, detail: "No SSO or gated IA in scope" },
    documented_sso: {
      points: 0.3,
      detail: "SSO exists and has an owner — still needs a lower-env prove-out",
    },
    gated_unproven: {
      points: 0.8,
      detail: "Gated content plus unproven SSO — a common cutover slip",
    },
  },
  personalization: {
    none: { points: 0, detail: "No personalization program to rebuild" },
    few_activities: {
      points: 0.2,
      detail: "A small activity set can be exported and rebuilt",
    },
    heavy_program: {
      points: 0.7,
      detail: "Heavy personalization — audiences, offers, and a freeze window",
    },
  },
  locales: {
    inherited: {
      points: 0,
      detail: "Locales mostly inherit — translation workflow, not re-authoring",
    },
    mixed: {
      points: 0.3,
      detail: "Mixed inheritance and local authoring across locales",
    },
    reauthored: {
      points: 0.7,
      detail: "Locales are largely re-authored — content and QA both grow",
    },
  },
};

const RISKS: Record<string, Risk> = {
  many_rebuild: {
    id: "tighten-rebuild",
    title: "Net-new component rebuild",
    explanation:
      "The catalog will not port 1:1. Budget mapping workshops and visual QA for dialogs and authoring-only behavior before promising template parity.",
    severity: "high",
    triggeredBy: ["tighten:components"],
  },
  unknown_vendors: {
    id: "tighten-forms",
    title: "Undocumented form and CRM endpoints",
    explanation:
      "Unknown vendors and hidden fields are the usual week-one defects. Inventory every production form before the pilot, including hidden and progressive fields.",
    severity: "high",
    triggeredBy: ["tighten:forms"],
  },
  gated_unproven: {
    id: "tighten-sso",
    title: "Unproven SSO and gated IA",
    explanation:
      "Gated pages must work in a lower environment with the real IdP before DNS moves. Treat login, session, and entitlement as a pilot gate.",
    severity: "high",
    triggeredBy: ["tighten:identity"],
  },
  heavy_program: {
    id: "tighten-personalization",
    title: "In-flight personalization program",
    explanation:
      "Activities, audiences, and offers need an export and a campaign freeze. Leaving this until cutover is how marketing finds gaps in week two.",
    severity: "high",
    triggeredBy: ["tighten:personalization"],
  },
  reauthored: {
    id: "tighten-locales",
    title: "Re-authored locale sites",
    explanation:
      "Fully re-authored languages do not inherit templates cheaply. Plan content ops and QA per locale, not a single translation pass.",
    severity: "medium",
    triggeredBy: ["tighten:locales"],
  },
  commerce_pim: {
    id: "tighten-commerce",
    title: "Commerce / PIM workstream",
    explanation:
      "Catalog and pricing templates should not share the marketing-page critical path. Staff them as a parallel stream with their own pilot.",
    severity: "high",
    triggeredBy: ["tighten:commerce_pim"],
  },
  parallel_deadline: {
    id: "tighten-deadline",
    title: "Compressed or parallel launch",
    explanation:
      "A hard date with multiple site streams adds coordination, not just hours. Expect more environment contention and a thicker cutover script.",
    severity: "medium",
    triggeredBy: ["tighten:parallel_deadline"],
  },
  regulatory: {
    id: "tighten-regulatory",
    title: "Regulatory or security gate",
    explanation:
      "Reviews add environments, evidence, and freeze windows that a sitemap-based band does not include. Put the gate on the plan before promising go-live.",
    severity: "medium",
    triggeredBy: ["tighten:regulatory"],
  },
};

export function emptyTighten(): TightenAnswers {
  return { ...EMPTY_TIGHTEN, extras: [] };
}

export function tightenActive(answers: TightenAnswers): boolean {
  if (answers.extras.length > 0) return true;
  return TIGHTEN_KEYS.some((key) => answers[key] !== "not_assessed");
}

export function normalizeTighten(raw: Partial<TightenAnswers> | null): TightenAnswers {
  const base = emptyTighten();
  if (!raw) return base;
  return {
    components: raw.components ?? base.components,
    forms: raw.forms ?? base.forms,
    identity: raw.identity ?? base.identity,
    personalization: raw.personalization ?? base.personalization,
    locales: raw.locales ?? base.locales,
    extras: (raw.extras ?? []).filter((item): item is TightenExtra =>
      TIGHTEN_EXTRAS.some((extra) => extra.id === item),
    ),
  };
}

export function tightenAdjustments(answers: TightenAnswers): ScoreAdjustments {
  const extraDrivers: ScoreDriver[] = [];
  const extraRisks: Risk[] = [];
  const assumptions: string[] = [];
  let effortMultiplier = 1;

  if (!tightenActive(answers)) {
    return { extraDrivers, effortMultiplier, extraRisks, assumptions };
  }

  assumptions.push(
    "Discovery answers in “Tighten the band” were applied on top of the sitemap rubric — they are interviewer judgment, not a package scan.",
  );

  for (const key of TIGHTEN_KEYS) {
    const choice = answers[key];
    const row = POINT_TABLE[key][choice];
    if (!row) continue;
    extraDrivers.push({
      id: `tighten-${key}`,
      label: TIGHTEN_QUESTIONS.find((q) => q.key === key)?.title ?? key,
      points: row.points,
      detail: row.detail,
    });
    const risk = RISKS[choice];
    if (risk) extraRisks.push(risk);
  }

  if (answers.extras.includes("commerce_pim")) {
    extraDrivers.push({
      id: "tighten-commerce",
      label: "Commerce / PIM scope",
      points: 0.4,
      detail: "Confirmed catalog or cart workstream alongside marketing pages",
    });
    extraRisks.push(RISKS.commerce_pim);
    effortMultiplier += 0.12;
  }
  if (answers.extras.includes("parallel_deadline")) {
    extraDrivers.push({
      id: "tighten-deadline",
      label: "Parallel streams / deadline",
      points: 0.2,
      detail: "Hard date or parallel site launches add coordination load",
    });
    extraRisks.push(RISKS.parallel_deadline);
    effortMultiplier += 0.15;
  }
  if (answers.extras.includes("regulatory")) {
    extraDrivers.push({
      id: "tighten-regulatory",
      label: "Regulatory / security review",
      points: 0.2,
      detail: "Review gates add environments and freeze time",
    });
    extraRisks.push(RISKS.regulatory);
    effortMultiplier += 0.1;
  }

  return {
    extraDrivers,
    effortMultiplier: Number(effortMultiplier.toFixed(2)),
    extraRisks,
    assumptions,
  };
}
