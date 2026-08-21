// Minimal BM25 keyword retrieval over the classified corpus, used by the
// "Ask the discovery engine" box. No embeddings API needed (paid or free) —
// term-overlap ranking is enough for grounding short factual questions
// against a few hundred review snippets.

const K1 = 1.5;
const B = 0.75;

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "to", "of", "and", "or",
  "in", "on", "for", "with", "this", "that", "it", "as", "at", "by", "from", "about",
  "what", "why", "how", "do", "does", "did", "i", "you", "my", "your",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export type Retrievable = { id: string; text: string };

export function bm25Rank<T extends Retrievable>(corpus: T[], query: string, topK: number): T[] {
  const docs = corpus.map((doc) => ({ doc, terms: tokenize(doc.text) }));
  const avgLen = docs.reduce((sum, d) => sum + d.terms.length, 0) / Math.max(1, docs.length);
  const queryTerms = [...new Set(tokenize(query))];

  const df = new Map<string, number>();
  for (const term of queryTerms) {
    let count = 0;
    for (const d of docs) if (d.terms.includes(term)) count++;
    df.set(term, count);
  }
  const N = docs.length;

  const scored = docs.map(({ doc, terms }) => {
    const len = terms.length || 1;
    let score = 0;
    for (const term of queryTerms) {
      const freq = terms.filter((t) => t === term).length;
      if (freq === 0) continue;
      const docFreq = df.get(term) ?? 0;
      const idf = Math.log(1 + (N - docFreq + 0.5) / (docFreq + 0.5));
      score += idf * ((freq * (K1 + 1)) / (freq + K1 * (1 - B + (B * len) / avgLen)));
    }
    return { doc, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.doc);
}
