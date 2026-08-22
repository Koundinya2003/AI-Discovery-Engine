import { NextRequest, NextResponse } from "next/server";
import type { AskRequest } from "@/lib/types";
import { answerFromCorpus } from "@/lib/groq/ask";
import { checkRateLimit } from "@/lib/redis";
import { log } from "@/lib/logger";

export const maxDuration = 30;

const MAX_QUESTION_LENGTH = 500;
const MAX_CORPUS_ITEMS = 500;

function clientIdentifier(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  let body: AskRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json({ error: `question must be ${MAX_QUESTION_LENGTH} characters or fewer` }, { status: 400 });
  }
  if (!Array.isArray(body.corpus) || body.corpus.length === 0) {
    return NextResponse.json({ error: "corpus is required (run a discover request first)" }, { status: 400 });
  }
  if (body.corpus.length > MAX_CORPUS_ITEMS) {
    return NextResponse.json({ error: `corpus must be ${MAX_CORPUS_ITEMS} items or fewer` }, { status: 400 });
  }

  const identifier = clientIdentifier(req);
  const rateLimit = await checkRateLimit("ask", identifier);
  if (rateLimit.limited) {
    log.info("ask.rate_limited", { identifier, retryAfterSeconds: rateLimit.retryAfterSeconds });
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) } }
    );
  }

  try {
    const result = await answerFromCorpus(question, body.corpus, body.themes ?? []);
    log.info("ask.complete", { identifier, corpusSize: body.corpus.length, durationMs: Date.now() - startedAt });
    return NextResponse.json(result);
  } catch (err) {
    log.error("ask.failed", { identifier, error: String(err) });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
