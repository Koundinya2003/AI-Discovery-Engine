"use client";

import { useEffect, useState } from "react";
import type { DiscoverResponse, SourceKind } from "@/lib/types";
import Header from "@/components/Header";
import SearchForm, { type SearchFormValues } from "@/components/SearchForm";
import StatTile from "@/components/StatTile";
import ThemeCard from "@/components/ThemeCard";
import AskBox from "@/components/AskBox";

const CACHE_KEY = "discovery-engine:last-result";

const SOURCE_ORDER: SourceKind[] = ["play_store", "app_store", "youtube", "forum"];

function sourceBreakdownLabel(stats: DiscoverResponse["stats"]): string {
  const parts = SOURCE_ORDER.map((source) => {
    const stat = stats.find((s) => s.source === source);
    return stat ? `${stat.count} ${stat.label}` : null;
  }).filter(Boolean) as string[];
  if (parts.length === 0) return "discussions";
  if (parts.length === 1) return `${parts[0]} discussions`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]} discussions`;
}

export default function Home() {
  // Starts null on both server and client so the first client render matches
  // the server-rendered HTML exactly — reading sessionStorage in a lazy
  // useState initializer instead would make the client's first render differ
  // from the server's whenever a cached result exists, causing a hydration
  // mismatch. Restoring the cache in an effect (client-only, post-hydration)
  // avoids that.
  const [result, setResult] = useState<DiscoverResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      // Restoring persisted state from a browser storage API on mount is
      // exactly what an effect is for — the alternative (reading it during
      // render, e.g. a lazy useState initializer) is the hydration-mismatch
      // bug this effect exists to avoid in the first place.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (cached) setResult(JSON.parse(cached) as DiscoverResponse);
    } catch {
      // ignore corrupt/unavailable session cache
    }
  }, []);

  async function handleSubmit(values: SearchFormValues) {
    setLoading(true);
    setError(null);
    // Clear any previous product's results immediately — otherwise a failed
    // or zero-item search for a *new* query left the *old* query's themes,
    // stats, resolved-match banner, and Q&A history fully rendered on screen
    // with no indication they belonged to a different search.
    setResult(null);
    try {
      sessionStorage.removeItem(CACHE_KEY);
    } catch {
      // storage unavailable — nothing to clean up
    }

    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: values.productName,
          appStoreId: values.appStoreId || undefined,
          playPackage: values.playPackage || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Discovery failed");

      setResult(data);
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } catch {
        // storage full or unavailable — result still renders from state
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      {result ? (
        <Header productName={result.productName} sourceBreakdown={sourceBreakdownLabel(result.stats)} />
      ) : (
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-de-text-muted">Growth Insights</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-de-text-primary">Discovery Engine</h1>
          <p className="mt-1 text-sm text-de-text-secondary">
            Search a product once — themes are discovered from what users actually said across every configured source.
          </p>
        </div>
      )}

      <SearchForm onSubmit={handleSubmit} loading={loading} />

      {error && (
        <div className="rounded-lg border border-[#e5573f]/40 bg-[#e5573f]/10 px-4 py-3 text-sm text-[#e5573f]">{error}</div>
      )}

      {result && (
        <>
          {(result.resolvedAppStoreTitle || result.resolvedPlayStoreTitle) && (
            <div className="rounded-lg border border-de-border bg-de-surface px-4 py-3 text-xs text-de-text-secondary">
              Resolved matches:{" "}
              {result.resolvedAppStoreTitle && <span className="text-de-text-primary">App Store — {result.resolvedAppStoreTitle}</span>}
              {result.resolvedAppStoreTitle && result.resolvedPlayStoreTitle && " · "}
              {result.resolvedPlayStoreTitle && <span className="text-de-text-primary">Play Store — {result.resolvedPlayStoreTitle}</span>}
            </div>
          )}

          {result.warnings.length > 0 && (
            <div className="rounded-lg border border-de-border bg-de-surface px-4 py-3 text-xs text-de-text-muted">
              {result.warnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          )}

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile value={result.totals.scraped} caption="Items scraped" />
            <StatTile value={result.totals.classified} caption="Items classified" />
            {SOURCE_ORDER.map((source) => {
              const stat = result.stats.find((s) => s.source === source);
              return (
                <StatTile
                  key={source}
                  value={stat?.count ?? 0}
                  caption={stat?.label ?? source}
                  error={stat?.error}
                />
              );
            })}
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-de-text-muted">
              Discovered themes ({result.themes.length})
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {result.themes.map((theme) => (
                <ThemeCard key={theme.code} theme={theme} />
              ))}
            </div>
          </section>

          <AskBox corpus={result.corpus} themes={result.themes} />
        </>
      )}
    </main>
  );
}
