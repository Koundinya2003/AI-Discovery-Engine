import type { DiscoverResponse } from "@/lib/types";
import { callGroq, type GroqMessage } from "./client";
import { bm25Rank } from "@/lib/retrieval/bm25";

const TOP_K = 18;

export async function answerFromCorpus(
  question: string,
  corpus: DiscoverResponse["corpus"],
  themes: DiscoverResponse["themes"]
): Promise<{ answer: string; usedThemeCodes: string[]; sourceCount: number }> {
  const retrieved = bm25Rank(corpus, question, TOP_K);

  if (retrieved.length === 0) {
    return {
      answer: "I couldn't find anything in the collected reviews that relates to this question.",
      usedThemeCodes: [],
      sourceCount: 0,
    };
  }

  const themeTitleByCode = new Map(themes.map((t) => [t.code, t.title]));
  const context = retrieved
    .map((item, i) => `${i + 1}. [${item.sourceLabel} · ${themeTitleByCode.get(item.themeCode) ?? item.themeCode}] ${item.text}`)
    .join("\n");

  const messages: GroqMessage[] = [
    {
      role: "system",
      content:
        "You are a product analyst answering questions using ONLY the provided review excerpts. " +
        "If the excerpts don't contain enough information to answer, say so plainly instead of guessing. " +
        "Be concise and specific, and reference concrete points from the excerpts.",
    },
    {
      role: "user",
      content: `Question: ${question}\n\nReview excerpts:\n${context}`,
    },
  ];

  const answer = await callGroq(messages, { maxTokens: 1024, temperature: 0.3 });
  const usedThemeCodes = [...new Set(retrieved.map((r) => r.themeCode))];

  return { answer, usedThemeCodes, sourceCount: retrieved.length };
}
