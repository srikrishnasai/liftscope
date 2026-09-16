import { resolveAiMemoConfig, stripMarkdownFence } from "./ai-config";
import {
  buildTemplateMemo,
  memoKeepsNumbers,
  nextQuestions,
  sanitizeReportForModel,
  type ClientMemo,
} from "./memo";
import type { TightenAnswers } from "./tighten";
import type { EstimateReport } from "./types";

export { aiMemoConfigured, resolveAiMemoConfig } from "./ai-config";

export async function polishMemoWithAi(
  report: EstimateReport,
  tighten?: TightenAnswers,
): Promise<ClientMemo> {
  const template = buildTemplateMemo(report, tighten);
  const config = resolveAiMemoConfig();
  if (!config) {
    return template;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: [
              "You write a one-page client memo for a CMS/AEM migration estimate.",
              "You may only rephrase. You must not change any number, add risks that are not in the JSON, or invent vendors, products, or page counts.",
              "Keep complexity, person-week low/mid/high, and driver point values exactly as given.",
              "Tone: senior agency partner, concise, no hype, no exclamation marks.",
              "Output GitHub-flavored markdown only. Start with a single # title. Do not wrap the document in a code fence.",
              "Include sections: Recommendation, What drives the number, Risks to put on the SOW, Shape of work, Ask the client next, Standing assumptions.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              facts: sanitizeReportForModel(report),
              askNext: nextQuestions(report, tighten),
              draft: template.markdown,
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      const hint =
        config.provider === "huggingface"
          ? " Check HF_TOKEN permissions and that the model is available on Inference Providers."
          : "";
      return {
        ...template,
        warning: `AI polish unavailable (HTTP ${response.status}).${hint} Showing the rubric memo.`,
      };
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = stripMarkdownFence(
      data.choices?.[0]?.message?.content?.trim() ?? "",
    );
    if (!content) {
      return {
        ...template,
        warning: "AI returned an empty draft. Showing the rubric memo.",
      };
    }

    if (!memoKeepsNumbers(content, report)) {
      return {
        ...template,
        warning:
          "AI draft drifted from rubric numbers, so it was discarded. Showing the template memo.",
      };
    }

    return {
      source: "ai",
      markdown: content,
      fingerprint: template.fingerprint,
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ...template,
      warning: aborted
        ? "AI polish timed out. Showing the rubric memo."
        : "AI polish failed. Showing the rubric memo.",
    };
  } finally {
    clearTimeout(timer);
  }
}
