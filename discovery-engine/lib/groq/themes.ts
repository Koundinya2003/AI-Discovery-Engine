// Pass 1 of the inductive layer: propose themes grounded in this run's actual
// text rather than sorting it into a pre-set list. The deductive frame in
// lib/taxonomy/deductive.ts covers the fixed questions the brief asks; this
// pass exists to surface what the frame didn't anticipate.
//
// The sample is chosen upstream (lib/sampling.ts) and handed in, so pass 1 and
// pass 2 see exactly the same items. Discovering themes from one slice and
// classifying a different one is what drove most items into the OTH catch-all
// in the previous build.

import type { CollectedItem, Theme } from "@/lib/types";
import { callGroqJsonWithRetry, type GroqMessage } from "./client";
import { log } from "@/lib/logger";

const MAX_CHARS_PER_ITEM = 180;
const MIN_NON_CATCHALL_THEMES = 4;
const DISCOVERY_MAX_TOKENS = 1400;
/** Hard cap on how many sampled items are shown to pass 1, for the token budget. */
export const DISCOVERY_PROMPT_ITEMS = 80;

export const THEME_SYSTEM_PROMPT = `You are a product analyst who reads raw user reviews, comments and community posts and identifies the SPECIFIC, concrete themes present — never generic categories.

Bad theme titles (too generic, never use this style): "Pricing", "Bugs", "Customer Support", "Availability".
Good theme titles (specific, grounded in what users actually said): "Budget anchoring — delivery charges feel like a tax on small orders", "Stockout-driven distrust", "Brand-frame mismatch between app and packaging".

Return ONLY a JSON object, no markdown fences, no commentary, matching exactly:
{
  "themes": [
    { "code": "XXXX", "title": "specific descriptive title", "definition": "one-line definition of what belongs in this theme" }
  ]
}

Rules:
- Propose 8 to 14 candidate themes plus one mandatory catch-all theme.
- Every theme code is 3-4 uppercase letters, unique.
- The catch-all theme MUST have code "OTH" and title "Unrelated / other" — for generic praise, noise, or anything that doesn't fit a specific theme.
- Every non-catch-all theme must be traceable to specific complaints/praise actually present in the sample below — do not invent themes with no evidence.
- Cover the whole sample, including anything said before a purchase (hesitation, comparison, questions) as well as after it. Do not collapse the sample into one stage of the journey if it contains more than one.`;

export function buildThemeUserPrompt(productName: string, sample: CollectedItem[]): string {
  const lines = sample.map((item, i) => {
    const text = item.text.length > MAX_CHARS_PER_ITEM ? item.text.slice(0, MAX_CHARS_PER_ITEM) + "…" : item.text;
    return `${i + 1}. [${item.sourceLabel} · ${item.platform}] ${text.replace(/\n/g, " ")}`;
  });
  return `Topic: ${productName} and comparable online fashion shopping platforms\n\nSample of ${sample.length} user reviews/comments/community posts:\n\n${lines.join("\n")}`;
}

export function validateThemes(parsed: unknown): Theme[] {
  if (typeof parsed !== "object" || parsed === null || !("themes" in parsed)) {
    throw new Error("Missing 'themes' array");
  }
  const themes = (parsed as { themes: unknown }).themes;
  if (!Array.isArray(themes) || themes.length === 0) throw new Error("'themes' must be a non-empty array");

  const result: Theme[] = themes.map((t) => {
    if (
      typeof t !== "object" ||
      t === null ||
      typeof (t as Theme).code !== "string" ||
      typeof (t as Theme).title !== "string" ||
      typeof (t as Theme).definition !== "string"
    ) {
      throw new Error("Each theme needs string code/title/definition");
    }
    return {
      code: (t as Theme).code.toUpperCase().slice(0, 4),
      title: (t as Theme).title,
      definition: (t as Theme).definition,
    };
  });

  if (!result.some((t) => t.code === "OTH")) {
    result.push({ code: "OTH", title: "Unrelated / other", definition: "Generic praise or noise that doesn't fit a specific theme." });
  }

  return result;
}

function nonCatchallCount(themes: Theme[]): number {
  return themes.filter((t) => t.code !== "OTH").length;
}

/** Discover themes from the exact sample pass 2 will classify. */
export async function discoverThemes(productName: string, sample: CollectedItem[]): Promise<Theme[]> {
  const shown = sample.slice(0, DISCOVERY_PROMPT_ITEMS);

  const messages: GroqMessage[] = [
    { role: "system", content: THEME_SYSTEM_PROMPT },
    { role: "user", content: buildThemeUserPrompt(productName, shown) },
  ];

  const first = await callGroqJsonWithRetry(messages, validateThemes, { maxTokens: DISCOVERY_MAX_TOKENS });
  if (nonCatchallCount(first) >= MIN_NON_CATCHALL_THEMES) return first;

  // The model under-delivered on the "8 to 14 themes" instruction — push back
  // once with an explicit count rather than shipping a run where nearly
  // everything lands in OTH. The correction deliberately names no example
  // categories: the previous version listed logistics categories here
  // ("delivery, refunds, app stability…"), which steered a second pass that
  // was supposed to be open-ended straight back into post-purchase themes.
  log.info("themes.low_yield_retry", { productName, sampleSize: shown.length, firstPassThemes: nonCatchallCount(first) });

  const retryMessages: GroqMessage[] = [
    ...messages,
    {
      role: "user",
      content: `Your last answer only had ${nonCatchallCount(first)} specific theme(s) for a sample of ${shown.length} items — read the sample again and separate the distinct patterns it actually contains, at every stage of the shopping journey. Propose at least 6 specific themes plus the OTH catch-all, each traceable to items in the sample.`,
    },
  ];

  try {
    const retry = await callGroqJsonWithRetry(retryMessages, validateThemes, { maxTokens: DISCOVERY_MAX_TOKENS, temperature: 0.5 });
    return nonCatchallCount(retry) > nonCatchallCount(first) ? retry : first;
  } catch (err) {
    log.error("themes.low_yield_retry_failed", { productName, error: String(err) });
    return first;
  }
}
