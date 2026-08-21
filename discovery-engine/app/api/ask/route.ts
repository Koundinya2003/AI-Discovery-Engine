import { NextRequest, NextResponse } from "next/server";
import type { AskRequest } from "@/lib/types";
import { answerFromCorpus } from "@/lib/groq/ask";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: AskRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.question?.trim()) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }
  if (!Array.isArray(body.corpus) || body.corpus.length === 0) {
    return NextResponse.json({ error: "corpus is required (run a discover request first)" }, { status: 400 });
  }

  try {
    const result = await answerFromCorpus(body.question.trim(), body.corpus, body.themes ?? []);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
