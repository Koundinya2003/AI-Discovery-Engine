"use client";

import { useState, type ComponentPropsWithoutRef, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import type { AskResponse, RunResult } from "@/lib/types";
import SourceTag from "./SourceTag";

const MARKDOWN_COMPONENTS = {
  p: (props: ComponentPropsWithoutRef<"p">) => <p className="mb-2 last:mb-0" {...props} />,
  strong: (props: ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-semibold text-de-text-primary" {...props} />
  ),
  ul: (props: ComponentPropsWithoutRef<"ul">) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0" {...props} />,
  ol: (props: ComponentPropsWithoutRef<"ol">) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0" {...props} />,
  a: (props: ComponentPropsWithoutRef<"a">) => (
    <a className="text-de-accent underline underline-offset-2" target="_blank" rel="noopener noreferrer" {...props} />
  ),
};

const SUGGESTED = [
  "Why do people not buy the items they saved?",
  "What makes someone unsure about size before ordering?",
  "What do people say about fabric quality from the photos?",
];

type ChatEntry = { question: string; answer: string; usedThemeTitles: string[]; sourceCount: number };

export default function AskBox({ run }: { run: RunResult }) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ChatEntry[]>([]);

  const themeTitleByCode = new Map(run.themes.map((t) => [t.code, t.title]));

  async function ask(q: string) {
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          // Only the fields retrieval and grounding need — not the whole run.
          corpus: run.corpus.map((i) => ({
            id: i.id,
            text: i.text,
            sourceLabel: i.sourceLabel,
            platform: i.platform,
            themeCode: i.themeCode,
            deductive: i.deductive,
          })),
          themes: run.themes.map((t) => ({ code: t.code, title: t.title })),
        }),
      });
      const data: AskResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The question couldn't be answered right now.");

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
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(question.trim());
  }

  return (
    <section className="rounded-xl border border-de-border bg-de-surface p-5">
      <h2 className="text-sm font-semibold text-de-text-primary">Ask the corpus</h2>
      <p className="mt-1 text-xs text-de-text-muted">
        Answers are grounded strictly in the {run.corpus.length} collected items — BM25 retrieval picks the closest
        excerpts, and the model is instructed to refuse rather than answer from outside them. A refusal is a real
        finding about what the corpus contains.
      </p>

      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Why do people not buy the items they saved?"
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

      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            type="button"
            disabled={loading}
            onClick={() => {
              setQuestion(s);
              void ask(s);
            }}
            className="rounded-full border border-de-border px-2.5 py-1 text-[11px] text-de-text-muted transition hover:text-de-text-secondary disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-[#e5573f]">{error}</p>}

      {history.length > 0 && (
        <ul className="mt-4 space-y-3">
          {history.map((entry, i) => (
            <li key={i} className="rounded-lg border border-de-border/60 bg-black/20 p-4">
              <p className="text-sm font-medium text-de-text-primary">{entry.question}</p>
              <div className="mt-2 text-sm leading-relaxed text-de-text-secondary">
                <ReactMarkdown components={MARKDOWN_COMPONENTS}>{entry.answer}</ReactMarkdown>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wide text-de-text-muted">
                  From {entry.sourceCount} excerpt{entry.sourceCount === 1 ? "" : "s"}
                  {entry.usedThemeTitles.length > 0 ? " across:" : ""}
                </span>
                {entry.usedThemeTitles.map((t, j) => (
                  <SourceTag key={j} label={t} />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
