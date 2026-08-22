// Pass 2 of the two-pass theme discovery design: classify every item in the
// (capped) working set against the theme list discovered in pass 1.
//
// Both BATCH_SIZE and CLASSIFY_MAX_ITEMS were tuned against this account's
// *actual* Groq free-tier limits, measured live via response headers rather
// than trusting the docs: the pinned model's real cap is 8,000 TPM (not the
// 6,000 documented), it's a reasoning model that burns 500-1,400 completion
// tokens per call on hidden chain-of-thought before it writes any JSON, and
// pass-1 theme discovery alone uses ~4,200 of that budget before pass 2 even
// starts. The original defaults (BATCH_SIZE 18, CLASSIFY_MAX_ITEMS 200,
// max_tokens 1500) were sized against the documented 6,000 TPM figure — in
// practice that meant ~90% of a run's batches got 429'd and silently fell
// back to OTH, and even a batch that fit the TPM budget could still get cut
// off mid-JSON ("max completion tokens reached before generating a valid
// document") because 18 items' worth of output plus the reasoning tax didn't
// reliably fit in 1500 completion tokens. See README "Tuning & limits" for
// how to raise these if you have Dev Tier headroom.
import type { ClassifiedTag, CollectedItem, Theme } from "@/lib/types";
import { callGroqJsonWithRetry, type GroqMessage } from "./client";

const BATCH_SIZE = 10;
export const CLASSIFY_MAX_ITEMS = Number(process.env.CLASSIFY_MAX_ITEMS ?? 36);
const MAX_CHARS_PER_ITEM = 500;

function buildSystemPrompt(themes: Theme[]): string {
  const themeList = themes.map((t) => `${t.code}: ${t.title} — ${t.definition}`).join("\n");
  return `You classify user review/comment snippets into exactly one theme each, from this fixed list:

${themeList}

For each input item, return its id, the single best-fitting theme code, a sentiment ("positive", "negative", "neutral", or "mixed"), and a confidence from 0 to 1.

Pick a specific (non-OTH) theme whenever the item has ANY clear connection to one, even if the match isn't perfect — a specific theme with a related complaint or praise is a better answer than defaulting to OTH. Reserve "OTH" strictly for items with no specific thematic signal at all: pure generic praise ("great app", "love it") with no detail, one-word/low-content noise, or content genuinely unrelated to any listed theme. Do not use OTH just because an item touches a theme only partially.

Return ONLY a JSON object, no markdown fences, no commentary, matching exactly:
{ "results": [ { "id": "...", "themeCode": "...", "sentiment": "...", "confidence": 0.0 } ] }

Return exactly one result per input item, using the same "id" values given.`;
}

function buildBatchPrompt(batch: CollectedItem[]): string {
  const lines = batch.map((item) => {
    const text = item.text.length > MAX_CHARS_PER_ITEM ? item.text.slice(0, MAX_CHARS_PER_ITEM) + "…" : item.text;
    return `{"id": "${item.id}", "text": ${JSON.stringify(text.replace(/\n/g, " "))}}`;
  });
  return `Items:\n[${lines.join(",\n")}]`;
}

export function validateBatch(parsed: unknown, batch: CollectedItem[], validCodes: Set<string>): ClassifiedTag[] {
  if (typeof parsed !== "object" || parsed === null || !("results" in parsed)) {
    throw new Error("Missing 'results' array");
  }
  const results = (parsed as { results: unknown }).results;
  if (!Array.isArray(results)) throw new Error("'results' must be an array");

  const byId = new Map(batch.map((item) => [item.id, item]));
  const tags: ClassifiedTag[] = [];

  for (const r of results) {
    if (typeof r !== "object" || r === null) continue;
    const row = r as { id?: string; themeCode?: string; sentiment?: string; confidence?: number };
    if (!row.id || !byId.has(row.id)) continue;
    const code = validCodes.has((row.themeCode ?? "").toUpperCase()) ? (row.themeCode as string).toUpperCase() : "OTH";
    const sentiment: ClassifiedTag["sentiment"] = ["positive", "negative", "neutral", "mixed"].includes(row.sentiment ?? "")
      ? (row.sentiment as ClassifiedTag["sentiment"])
      : "neutral";
    tags.push({
      itemId: row.id,
      themeCode: code,
      sentiment,
      confidence: typeof row.confidence === "number" ? Math.max(0, Math.min(1, row.confidence)) : 0.5,
    });
  }

  // Any item the model dropped from its response still needs a tag so counts add up.
  const tagged = new Set(tags.map((t) => t.itemId));
  for (const item of batch) {
    if (!tagged.has(item.id)) {
      tags.push({ itemId: item.id, themeCode: "OTH", sentiment: "neutral", confidence: 0 });
    }
  }

  return tags;
}

export function pickWorkingSet(items: CollectedItem[], max: number): CollectedItem[] {
  if (items.length <= max) return items;
  // Stratified sample across sources, same rationale as theme discovery: don't
  // let whichever source returned the most raw items dominate what gets classified.
  const bySource = new Map<string, CollectedItem[]>();
  for (const item of items) {
    const arr = bySource.get(item.source) ?? [];
    arr.push(item);
    bySource.set(item.source, arr);
  }
  const sources = [...bySource.keys()];
  const perSource = Math.floor(max / sources.length);
  const picked: CollectedItem[] = [];
  for (const source of sources) picked.push(...bySource.get(source)!.slice(0, perSource));
  return picked.slice(0, max);
}

export async function classifyItems(items: CollectedItem[], themes: Theme[]): Promise<{ tags: ClassifiedTag[]; workingSet: CollectedItem[] }> {
  const workingSet = pickWorkingSet(items, CLASSIFY_MAX_ITEMS);
  const validCodes = new Set(themes.map((t) => t.code));
  const systemPrompt = buildSystemPrompt(themes);

  const batches: CollectedItem[][] = [];
  for (let i = 0; i < workingSet.length; i += BATCH_SIZE) {
    batches.push(workingSet.slice(i, i + BATCH_SIZE));
  }

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
      } catch {
        // Both attempts failed — fall back to OTH for this batch rather than losing the run.
        return batch.map((item) => ({ itemId: item.id, themeCode: "OTH", sentiment: "neutral" as const, confidence: 0 }));
      }
    })
  );

  return { tags: batchResults.flat(), workingSet };
}
