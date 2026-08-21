// Pass 1 of the two-pass theme discovery design: propose themes grounded in
// this specific product's actual reviews, rather than classifying against a
// fixed pre-set taxonomy. Deliberately more expensive (one extra LLM call)
// than a fixed category list, in exchange for specific, useful theme names
// instead of generic buckets like "pricing" or "bugs".

import type { CollectedItem, Theme } from "@/lib/types";
import { callGroqJsonWithRetry, type GroqMessage } from "./client";

const SAMPLE_SIZE = 200;
const MAX_CHARS_PER_ITEM = 300;

function diverseSample(items: CollectedItem[], size: number): CollectedItem[] {
  if (items.length <= size) return items;

  // Stratify by source so the sample isn't dominated by whichever source
  // happened to return the most items, then fill any remainder randomly.
  const bySource = new Map<string, CollectedItem[]>();
  for (const item of items) {
    const arr = bySource.get(item.source) ?? [];
    arr.push(item);
    bySource.set(item.source, arr);
  }

  const sources = [...bySource.keys()];
  const perSource = Math.floor(size / sources.length);
  const sample: CollectedItem[] = [];

  for (const source of sources) {
    const pool = shuffle(bySource.get(source)!);
    sample.push(...pool.slice(0, perSource));
  }

  if (sample.length < size) {
    const remaining = shuffle(items.filter((i) => !sample.includes(i)));
    sample.push(...remaining.slice(0, size - sample.length));
  }

  return sample.slice(0, size);
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const SYSTEM_PROMPT = `You are a product analyst who reads raw user reviews/comments and identifies the SPECIFIC, concrete themes present — never generic categories.

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
- Every non-catch-all theme must be traceable to specific complaints/praise actually present in the sample below — do not invent themes with no evidence.`;

function buildUserPrompt(productName: string, sample: CollectedItem[]): string {
  const lines = sample.map((item, i) => {
    const text = item.text.length > MAX_CHARS_PER_ITEM ? item.text.slice(0, MAX_CHARS_PER_ITEM) + "…" : item.text;
    return `${i + 1}. [${item.source}] ${text.replace(/\n/g, " ")}`;
  });
  return `Product: ${productName}\n\nSample of ${sample.length} user reviews/comments/discussion snippets:\n\n${lines.join("\n")}`;
}

function validateThemes(parsed: unknown): Theme[] {
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

export async function discoverThemes(productName: string, items: CollectedItem[]): Promise<Theme[]> {
  const sample = diverseSample(items, SAMPLE_SIZE);

  const messages: GroqMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(productName, sample) },
  ];

  return callGroqJsonWithRetry(messages, validateThemes, { maxTokens: 2048 });
}
