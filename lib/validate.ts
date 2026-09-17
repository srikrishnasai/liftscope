import {
  MIGRATION_TARGETS,
  type EstimateInput,
  type MigrationTarget,
} from "./types";

export function isMigrationTarget(value: unknown): value is MigrationTarget {
  return (
    typeof value === "string" &&
    (MIGRATION_TARGETS as readonly string[]).includes(value)
  );
}

export function parseEstimateRequest(body: unknown): EstimateInput {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be a JSON object");
  }

  const raw = body as Record<string, unknown>;

  if (raw.demo === true) {
    return {
      target: isMigrationTarget(raw.target) ? raw.target : "aem-to-other",
      siteCount: Number(raw.siteCount) || 3,
      languageCount: Number(raw.languageCount) || 4,
      customComponentCount: Number(raw.customComponentCount) || 48,
      demo: true,
      sitemapUrl: typeof raw.sitemapUrl === "string" ? raw.sitemapUrl : undefined,
      sitemapXml: typeof raw.sitemapXml === "string" ? raw.sitemapXml : undefined,
      samplePageUrls: Array.isArray(raw.samplePageUrls)
        ? raw.samplePageUrls.filter((item): item is string => typeof item === "string")
        : typeof raw.samplePageUrls === "string"
          ? [raw.samplePageUrls]
          : undefined,
    };
  }

  if (!isMigrationTarget(raw.target)) {
    throw new Error(
      "target must be aemaacs-upgrade, aem-to-other, or other-to-aem",
    );
  }

  if (typeof raw.sitemapXml === "string" && raw.sitemapXml.length > 2_000_000) {
    throw new Error("Sitemap XML must be under 2MB");
  }

  return {
    target: raw.target,
    siteCount: Number(raw.siteCount),
    languageCount: Number(raw.languageCount),
    customComponentCount: Number(raw.customComponentCount),
    repoCount: Number(raw.repoCount),
    sitemapUrl: typeof raw.sitemapUrl === "string" ? raw.sitemapUrl : undefined,
    sitemapXml: typeof raw.sitemapXml === "string" ? raw.sitemapXml : undefined,
    samplePageUrls: Array.isArray(raw.samplePageUrls)
      ? raw.samplePageUrls.filter((item): item is string => typeof item === "string")
      : typeof raw.samplePageUrls === "string"
        ? [raw.samplePageUrls]
        : undefined,
    demo: false,
  };
}
