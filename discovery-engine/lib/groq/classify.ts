// Pass 2 of the inductive layer: classify the sampled items against the themes
// pass 1 discovered, and — in the same response — ask the model for its own
// deductive labels so rule-based labelling can be audited against it.
//
// What changed from the previous build: an item the model never returned a
// tag for is no longer silently written down as "OTH". A missing tag is
// reported as *unclassified*, so the OTH bar in the UI means "the model looked
// and found nothing specific", not "the request 429'd". That distinction is
// the difference between a real finding and an artifact of the free tier.
//
// BATCH_SIZE and CLASSIFY_MAX_ITEMS are tuned against this account's measured
// Groq free-tier limits (8,000 TPM for the pinned reasoning model, ~4,200 of
// which pass 1 spends before pass 2 starts) — see README "Tuning & limits".

import type { ClassifiedTag, CollectedItem, Sentiment, Theme } from "@/lib/types";
import { DEDUCTIVE_LABELS, isDeductiveCode, type DeductiveCode } from "@/lib/taxonomy/deductive";
import { callGroqJsonWithRetry, type GroqMessage } from "./client";
import { log } from "@/lib/logger";

const BATCH_SIZE = 10;
export const CLASSIFY_MAX_ITEMS = Number(process.env.CLASSIFY_MAX_ITEMS ?? 48);
const MAX_CHARS_PER_ITEM = 400;
const SENTIMENTS: Sentiment[] = ["positive", "negative", "neutral", "mixed"];

export function buildClassifySystemPrompt(themes: Theme[]): string {
  const themeList = themes.map((t) => `${t.code}: ${t.title} — ${t.definition}`).join("\n");
  const frameList = DEDUCTIVE_LABELS.map((l) => `${l.code}: ${l.title} — ${l.definition}`).join("\n");

  return `You classify user review/comment/community snippets on two axes at once.

AXIS 1 — discovered themes. Pick exactly ONE code from this list:

${themeList}

Pick a specific (non-OTH) theme whenever the item has ANY clear connection to one, even if the match isn't perfect. Reserve "OTH" strictly for items with no specific thematic signal at all: pure generic praise ("great app", "love it") with no detail, one-word noise, or content genuinely unrelated to every listed theme.

AXIS 2 — fixed frame. Return ALL codes from this list that apply (zero, one, or several); use ["OTHER"] when none do:

${frameList}
OTHER: nothing in the text maps to the frame.

Also return a sentiment ("positive", "negative", "neutral", or "mixed") and a confidence from 0 to 1.

Return ONLY a JSON object, no markdown fences, no commentary, matching exactly:
{ "results": [ { "id": "...", "themeCode": "...", "frame": ["..."], "sentiment": "...", "confidence": 0.0 } ] }

Return exactly one result per input item, using the same "id" values given.`;
}

export function buildBatchPrompt(batch: CollectedItem[]): string {
  const lines = batch.map((item) => {
    const text = item.text.length > MAX_CHARS_PER_ITEM ? item.text.slice(0, MAX_CHARS_PER_ITEM) + "…" : item.text;
    return `{"id": ${JSON.stringify(item.id)}, "text": ${JSON.stringify(text.replace(/\n/g, " "))}}`;
  });
  return `Items:\n[${lines.join(",\n")}]`;
}

/**
 * Validate one batch response. Items the model omitted are simply absent from
 * the returned tags — the caller treats them as unclassified rather than
 * inventing a label for them.
 */
export function validateBatch(parsed: unknown, batch: CollectedItem[], validCodes: Set<string>): ClassifiedTag[] {
  if (typeof parsed !== "object" || parsed === null || !("results" in parsed)) {
    throw new Error("Missing 'results' array");
  }
  const results = (parsed as { results: unknown }).results;
  if (!Array.isArray(results)) throw new Error("'results' must be an array");

  const byId = new Map(batch.map((item) => [item.id, item]));
  const tags: ClassifiedTag[] = [];
  const seen = new Set<string>();

  for (const r of results) {
    if (typeof r !== "object" || r === null) continue;
    const row = r as { id?: string; themeCode?: string; frame?: unknown; sentiment?: string; confidence?: number };
    if (!row.id || !byId.has(row.id) || seen.has(row.id)) continue;
    seen.add(row.id);

    const upper = (row.themeCode ?? "").toUpperCase();
    const code = validCodes.has(upper) ? upper : "OTH";

    const frame = Array.isArray(row.frame)
      ? [...new Set(row.frame.filter((f): f is string => typeof f === "string").map((f) => f.toUpperCase()))].filter(
          isDeductiveCode
        )
      : [];

    tags.push({
      itemId: row.id,
      themeCode: code,
      sentiment: SENTIMENTS.includes(row.sentiment as Sentiment) ? (row.sentiment as Sentiment) : "neutral",
      confidence: typeof row.confidence === "number" ? Math.max(0, Math.min(1, row.confidence)) : 0.5,
      deductive: (frame.length > 0 ? frame : ["OTHER"]) as DeductiveCode[],
    });
  }

  // A response that named none of the items is a failed response, not an
  // empty one — surface it so the retry path gets a chance.
  if (tags.length === 0 && batch.length > 0) throw new Error("No results matched the requested item ids");

  return tags;
}

export type ClassifyResult = {
  tags: ClassifiedTag[];
  /** Items sent to the model — the denominator for LLM coverage. */
  attempted: number;
  /** Batches that failed outright; their items stay unclassified. */
  failedBatches: number;
};

export async function classifyItems(items: CollectedItem[], themes: Theme[]): Promise<ClassifyResult> {
  const validCodes = new Set(themes.map((t) => t.code));
  const systemPrompt = buildClassifySystemPrompt(themes);

  const batches: CollectedItem[][] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) batches.push(items.slice(i, i + BATCH_SIZE));

  let failedBatches = 0;

  const batchResults = await Promise.all(
    batches.map(async (batch) => {
      const messages: GroqMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildBatchPrompt(batch) },
      ];
      try {
        return await callGroqJsonWithRetry(messages, (parsed) => validateBatch(parsed, batch, validCodes), {
          maxTokens: 2000,
        });
      } catch (err) {
        // Both attempts failed. Leave these items unclassified instead of
        // labelling them OTH — a rate-limit is not a finding about the data.
        failedBatches++;
        log.error("classify.batch_failed", { batchSize: batch.length, error: String(err) });
        return [] as ClassifiedTag[];
      }
    })
  );

  return { tags: batchResults.flat(), attempted: items.length, failedBatches };
}
