// Grounded Q&A over the labelled corpus.
//
// The refusal behaviour is the point, not a limitation: asked about wishlist
// abandonment against a corpus of post-delivery app reviews, the honest answer
// is "these excerpts don't cover that". The prompt below makes that the
// required response rather than one the model might happen to give, and the
// retrieval step runs over the FULL labelled corpus rather than only the
// LLM-sampled slice, so a refusal means the corpus really is silent.

import type { AskRequest } from "@/lib/types";
import { callGroq, type GroqMessage } from "./client";
import { bm25Rank } from "@/lib/retrieval/bm25";

const TOP_K = 18;

export const ASK_SYSTEM_PROMPT = `You are a product analyst answering questions using ONLY the numbered review excerpts provided.

Rules, in priority order:
1. If the excerpts do not contain enough information to answer, say so plainly and stop. Do not answer from general knowledge about the product, the industry, or typical user behaviour. A clear "the excerpts don't cover this" is the correct answer, not a failure.
2. Never generalise beyond what the excerpts say. Do not estimate, extrapolate, or infer a cause that is not stated.
3. When you can answer, cite the excerpt numbers you used, like [3], [7].
4. Be concise and concrete, quoting the excerpts' own wording where it helps.`;

export async function answerFromCorpus(
  question: string,
  corpus: AskRequest["corpus"],
  themes: AskRequest["themes"]
): Promise<{ answer: string; usedThemeCodes: string[]; sourceCount: number }> {
  const retrieved = bm25Rank(corpus, question, TOP_K);

  if (retrieved.length === 0) {
    return {
      answer:
        "Nothing in the collected corpus matches this question — no excerpt shares enough vocabulary with it to retrieve. That is a statement about the corpus, not an answer to the question.",
      usedThemeCodes: [],
      sourceCount: 0,
    };
  }

  const themeTitleByCode = new Map(themes.map((t) => [t.code, t.title]));
  const context = retrieved
    .map((item, i) => {
      const theme = item.themeCode ? (themeTitleByCode.get(item.themeCode) ?? item.themeCode) : "unclassified";
      const frame = item.deductive?.join(", ") ?? "";
      return `${i + 1}. [${item.sourceLabel} · ${item.platform} · ${theme}${frame ? ` · ${frame}` : ""}] ${item.text}`;
    })
    .join("\n");

  const messages: GroqMessage[] = [
    { role: "system", content: ASK_SYSTEM_PROMPT },
    { role: "user", content: `Question: ${question}\n\nReview excerpts:\n${context}` },
  ];

  const answer = await callGroq(messages, { maxTokens: 1024, temperature: 0.2 });
  const usedThemeCodes = [...new Set(retrieved.map((r) => r.themeCode).filter((c): c is string => Boolean(c)))];

  return { answer, usedThemeCodes, sourceCount: retrieved.length };
}
