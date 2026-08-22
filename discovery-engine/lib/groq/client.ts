// Groq chat-completion client.
//
// Deliberately NOT OpenRouter's `openrouter/free` auto-router — that's what
// caused the original bug (it can silently land on a non-chat model like a
// content-safety classifier and break JSON parsing). Groq's free tier has no
// auto-routing: GROQ_MODEL pins one explicit instruct model, always.
//
// Free-tier limits (as of writing): 30 requests/min, 6,000 tokens/min,
// 14,400 requests/day. `callGroq` serializes all calls through a single
// queue with a floor delay between requests so a busy discover run stays
// under the RPM cap without needing external orchestration.

import { log } from "@/lib/logger";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MIN_DELAY_MS = 2100; // ~28 requests/min, safely under the 30 RPM cap

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(async () => {
    // The floor delay must apply whether fn() succeeds or throws — skipping
    // it on failure (as a bare `await fn(); await delay();` would) lets one
    // 429 cascade into a burst of immediately-following calls that all also
    // get 429'd, since nothing paced them against the still-active rate limit.
    try {
      return await fn();
    } finally {
      await new Promise((r) => setTimeout(r, MIN_DELAY_MS));
    }
  });
  // Swallow rejections in the queue chain itself so one failed call doesn't
  // wedge the queue for subsequent callers; each caller still sees its own error.
  queue = result.catch(() => undefined);
  return result;
}

export type GroqMessage = { role: "system" | "user" | "assistant"; content: string };

/** Thrown for a 429 specifically, so callers can skip the pointless "fix your JSON" retry. */
export class GroqRateLimitError extends Error {}

export async function callGroq(
  messages: GroqMessage[],
  opts: { maxTokens?: number; temperature?: number; jsonMode?: boolean } = {}
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

  return enqueue(async () => {
    const startedAt = Date.now();
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 2048,
        ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log.error("groq.call_failed", {
        status: res.status,
        durationMs: Date.now() - startedAt,
        body: body.slice(0, 300),
        remainingTokens: res.headers.get("x-ratelimit-remaining-tokens"),
        limitTokens: res.headers.get("x-ratelimit-limit-tokens"),
        resetTokens: res.headers.get("x-ratelimit-reset-tokens"),
      });
      if (res.status === 429) throw new GroqRateLimitError(`Groq API error ${res.status}: ${body.slice(0, 500)}`);
      throw new Error(`Groq API error ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content || !content.trim()) throw new Error("Groq returned an empty response");
    log.info("groq.call_succeeded", {
      model,
      durationMs: Date.now() - startedAt,
      usage: data.usage,
      remainingTokens: res.headers.get("x-ratelimit-remaining-tokens"),
      limitTokens: res.headers.get("x-ratelimit-limit-tokens"),
    });
    return content as string;
  });
}

/** Strip markdown code fences if the model wraps JSON in ```json ... ``` despite instructions. */
export function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : trimmed;
}

/**
 * Call Groq expecting JSON, parse it, and validate with `validate`. On parse
 * or validation failure, retries once with an explicit correction message
 * appended — strict JSON output is never guaranteed from an LLM, so every
 * classification/discovery call needs exactly one retry, not zero and not a
 * loop.
 */
export async function callGroqJsonWithRetry<T>(
  messages: GroqMessage[],
  validate: (parsed: unknown) => T,
  opts: { maxTokens?: number; temperature?: number } = {}
): Promise<T> {
  const attempt = async (msgs: GroqMessage[]): Promise<T> => {
    const raw = await callGroq(msgs, { ...opts, jsonMode: true });
    const parsed = JSON.parse(extractJson(raw));
    return validate(parsed);
  };

  try {
    return await attempt(messages);
  } catch (err) {
    // A 429 means the account's TPM budget is exhausted right now — asking the
    // model to "fix your JSON" doesn't address that, and the retry attempt is
    // itself another call that's virtually guaranteed to also 429, wasting
    // both budget and wall-clock time. Let the caller's own fallback handle it.
    if (err instanceof GroqRateLimitError) throw err;
    const correction: GroqMessage = {
      role: "user",
      content: `Your previous response was not valid JSON matching the required schema (error: ${
        err instanceof Error ? err.message : String(err)
      }). Return ONLY valid JSON, no markdown fences, no commentary, matching the schema exactly.`,
    };
    return attempt([...messages, correction]);
  }
}
