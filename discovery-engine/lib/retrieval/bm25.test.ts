import { describe, expect, it } from "vitest";
import { bm25Rank, type Retrievable } from "./bm25";

function doc(id: string, text: string): Retrievable {
  return { id, text };
}

describe("bm25Rank", () => {
  it("ranks documents with more term overlap higher", () => {
    const corpus = [
      doc("1", "the delivery was late and the box was damaged"),
      doc("2", "great app, love the discounts"),
      doc("3", "delivery delivery delivery was very very late"),
    ];

    const ranked = bm25Rank(corpus, "delivery late", 3);

    expect(ranked[0].id).toBe("3");
    expect(ranked.map((d) => d.id)).not.toContain("2");
  });

  it("ignores stopwords when scoring", () => {
    const corpus = [doc("1", "the app is the best"), doc("2", "refund never arrived")];
    const ranked = bm25Rank(corpus, "the is a", 5);
    expect(ranked).toHaveLength(0);
  });

  it("returns an empty array for an empty corpus", () => {
    expect(bm25Rank([], "anything", 5)).toEqual([]);
  });

  it("respects topK", () => {
    const corpus = Array.from({ length: 10 }, (_, i) => doc(String(i), "refund refund refund"));
    const ranked = bm25Rank(corpus, "refund", 3);
    expect(ranked).toHaveLength(3);
  });
});
