"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ProgressEvent, RunResult } from "@/lib/types";
import SearchForm, { type SearchFormValues } from "@/components/SearchForm";
import ReportView from "@/components/ReportView";
import ProgressPanel, { EMPTY_PROGRESS, reduceProgress, type ProgressState } from "@/components/ProgressPanel";

const CACHE_KEY = "discovery-engine:last-run";

export default function Home() {
  // Starts null on both server and client so the first client render matches
  // the server HTML exactly; the cached run is restored post-hydration.
  const [run, setRun] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState>(EMPTY_PROGRESS);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      // Restoring persisted state from browser storage on mount is what an
      // effect is for — reading it during render is the hydration-mismatch bug
      // this avoids.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (cached) setRun(JSON.parse(cached) as RunResult);
    } catch {
      // corrupt or unavailable session cache — ignore
    }
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function handleSubmit(values: SearchFormValues) {
    setLoading(true);
    setError(null);
    setProgress(EMPTY_PROGRESS);
    // Clear the previous run immediately so a failed search can't leave the
    // old platform's tables on screen looking like the new one's.
    setRun(null);
    try {
      sessionStorage.removeItem(CACHE_KEY);
    } catch {
      // storage unavailable — nothing to clean up
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          productName: values.productName,
          comparisonPlatforms: values.comparisonPlatforms,
          appStoreId: values.appStoreId || undefined,
          playPackage: values.playPackage || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "The analysis couldn't be started.");
      }
      if (!res.body) throw new Error("This browser can't read a streamed response.");

      // NDJSON: one JSON event per line, so a partial chunk is buffered until
      // its newline arrives rather than being parsed half-written.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalRun: RunResult | null = null;
      let streamError: string | null = null;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newline: number;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;

          let event: ProgressEvent;
          try {
            event = JSON.parse(line) as ProgressEvent;
          } catch {
            continue;
          }

          if (event.type === "result") finalRun = event.result;
          else if (event.type === "error") streamError = event.message;
          else setProgress((p) => reduceProgress(p, event));
        }
      }

      if (streamError) throw new Error(streamError);
      if (!finalRun) throw new Error("The analysis ended before returning a result.");

      setRun(finalRun);
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(finalRun));
      } catch {
        // storage full — the run still renders from state
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  const emptyRun = run !== null && run.coverage.analysed === 0;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      {!run && (
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-de-text-muted">
            Wishlist → purchase · opportunity discovery
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-de-text-primary">Discovery Engine</h1>
          <p className="mt-1 max-w-3xl text-sm text-de-text-secondary">
            Collects public conversation about online fashion shopping across app-store reviews, Reddit communities and
            YouTube, labels 100% of it against a fixed frame, induces themes from a stated stratified sample, and ranks
            the resulting opportunity areas with a published formula.{" "}
            <Link href="/methodology" className="text-de-accent underline underline-offset-2">
              Methodology →
            </Link>
          </p>
        </div>
      )}

      <SearchForm onSubmit={handleSubmit} loading={loading} />

      {loading && <ProgressPanel progress={progress} />}

      {error && (
        <div className="rounded-lg border border-[#e5573f]/40 bg-[#e5573f]/10 px-4 py-3 text-sm text-[#e5573f]">
          {error}
        </div>
      )}

      {emptyRun && (
        <div className="rounded-xl border border-[#e5a33f]/40 bg-[#e5a33f]/10 px-4 py-3 text-sm text-[#e5a33f]">
          Every source came back empty for this query, so there is nothing to analyse. The per-source panel below says
          why each one returned nothing.
        </div>
      )}

      {run && <ReportView run={run} />}
    </main>
  );
}
