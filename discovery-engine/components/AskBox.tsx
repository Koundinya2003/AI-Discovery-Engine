"use client";

import { useState, type FormEvent } from "react";
import type { AskResponse, DiscoverResponse } from "@/lib/types";
import SourceTag from "./SourceTag";

type ChatEntry = { question: string; answer: string; usedThemeTitles: string[]; sourceCount: number };

export default function AskBox({ corpus, themes }: { corpus: DiscoverResponse["corpus"]; themes: DiscoverResponse["themes"] }) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ChatEntry[]>([]);

  const themeTitleByCode = new Map(themes.map((t) => [t.code, t.title]));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, corpus, themes }),
      });
      const data: AskResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to get an answer");

      setHistory((h) => [
        {
          question: q,
          answer: data.answer,
          usedThemeTitles: data.usedThemeCodes.map((c) => themeTitleByCode.get(c) ?? c),
          sourceCount: data.sourceCount,
        },
        ...h,
      ]);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-de-border bg-de-surface p-5">
      <h2 className="text-sm font-semibold text-de-text-primary">Ask the discovery engine</h2>
      <p className="mt-1 text-xs text-de-text-muted">
        Answers are grounded only in the collected reviews and comments — retrieval picks the most relevant excerpts before asking Groq.
      </p>

      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. What is the biggest delivery complaint?"
          className="flex-1 rounded-lg border border-de-border bg-black/30 px-3.5 py-2.5 text-sm text-de-text-primary placeholder:text-de-text-muted focus:border-de-accent focus:outline-none focus:ring-1 focus:ring-de-accent"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="rounded-lg bg-de-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Thinking…" : "Ask"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-[#e5573f]">{error}</p>}

      {history.length > 0 && (
        <ul className="mt-4 space-y-3">
          {history.map((entry, i) => (
            <li key={i} className="rounded-lg border border-de-border/60 bg-black/20 p-4">
              <p className="text-sm font-medium text-de-text-primary">{entry.question}</p>
              <p className="mt-2 text-sm leading-relaxed text-de-text-secondary whitespace-pre-wrap">{entry.answer}</p>
              {entry.usedThemeTitles.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wide text-de-text-muted">
                    From {entry.sourceCount} excerpts across:
                  </span>
                  {entry.usedThemeTitles.map((t, j) => (
                    <SourceTag key={j} label={t} />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
