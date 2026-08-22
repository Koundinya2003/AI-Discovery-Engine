"use client";

import { useEffect, useState, type FormEvent } from "react";

export type SearchFormValues = {
  productName: string;
  appStoreId: string;
  playPackage: string;
};

// A full discover run has no server-pushed progress events (it's a single
// synchronous request), so this is a client-side illustrative progression
// through the pipeline's actual stages, timed to roughly match how long each
// one takes — not a literal signal from the backend. It exists purely so the
// ~15-20s wait doesn't look frozen on a disabled button.
const DISCOVERY_STAGES = [
  "Searching Play Store, App Store, YouTube, and forums…",
  "Collecting reviews and comments…",
  "Discovering themes from what users said…",
  "Classifying reviews against those themes…",
  "Almost done…",
];
const STAGE_INTERVAL_MS = 3500;

export default function SearchForm({
  onSubmit,
  loading,
}: {
  onSubmit: (values: SearchFormValues) => void;
  loading: boolean;
}) {
  const [productName, setProductName] = useState("");
  const [appStoreId, setAppStoreId] = useState("");
  const [playPackage, setPlayPackage] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, DISCOVERY_STAGES.length - 1));
    }, STAGE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loading]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!productName.trim() || loading) return;
    setStageIndex(0); // a plain event handler, not an effect — safe to reset here directly
    onSubmit({ productName: productName.trim(), appStoreId: appStoreId.trim(), playPackage: playPackage.trim() });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-de-border bg-de-surface p-5">
      <label htmlFor="productName" className="block text-xs font-medium uppercase tracking-wide text-de-text-muted">
        Product or app name
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          id="productName"
          type="text"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          placeholder="e.g. Nykaa Fashion"
          className="flex-1 rounded-lg border border-de-border bg-black/30 px-3.5 py-2.5 text-sm text-de-text-primary placeholder:text-de-text-muted focus:border-de-accent focus:outline-none focus:ring-1 focus:ring-de-accent"
        />
        <button
          type="submit"
          disabled={loading || !productName.trim()}
          className="rounded-lg bg-de-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Discovering…" : "Discover themes"}
        </button>
      </div>

      {loading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-de-text-muted" role="status" aria-live="polite">
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-de-border border-t-de-accent" />
          {DISCOVERY_STAGES[stageIndex]}
        </div>
      )}

      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        className="mt-3 text-xs font-medium text-de-text-muted underline decoration-de-border underline-offset-4 hover:text-de-text-secondary"
      >
        {advancedOpen ? "Hide" : "Show"} advanced (exact App Store ID / Play package)
      </button>

      {advancedOpen && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="appStoreId" className="block text-xs text-de-text-muted">
              App Store ID
            </label>
            <input
              id="appStoreId"
              type="text"
              value={appStoreId}
              onChange={(e) => setAppStoreId(e.target.value)}
              placeholder="e.g. 1439872423"
              className="mt-1 w-full rounded-lg border border-de-border bg-black/30 px-3 py-2 text-sm text-de-text-primary placeholder:text-de-text-muted focus:border-de-accent focus:outline-none focus:ring-1 focus:ring-de-accent"
            />
          </div>
          <div>
            <label htmlFor="playPackage" className="block text-xs text-de-text-muted">
              Play Store package
            </label>
            <input
              id="playPackage"
              type="text"
              value={playPackage}
              onChange={(e) => setPlayPackage(e.target.value)}
              placeholder="e.g. com.fsn.nds"
              className="mt-1 w-full rounded-lg border border-de-border bg-black/30 px-3 py-2 text-sm text-de-text-primary placeholder:text-de-text-muted focus:border-de-accent focus:outline-none focus:ring-1 focus:ring-de-accent"
            />
          </div>
        </div>
      )}
    </form>
  );
}
