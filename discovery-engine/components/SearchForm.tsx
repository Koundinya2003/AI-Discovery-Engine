"use client";

import { useState, type FormEvent } from "react";
import { DEFAULT_COMPARISON_PLATFORMS } from "@/lib/platforms";

export type SearchFormValues = {
  productName: string;
  comparisonPlatforms: string[];
  appStoreId: string;
  playPackage: string;
};

const SUGGESTED_COMPARISONS = ["Myntra", "AJIO", "Meesho"];

export default function SearchForm({
  onSubmit,
  loading,
}: {
  onSubmit: (values: SearchFormValues) => void;
  loading: boolean;
}) {
  const [productName, setProductName] = useState("Nykaa Fashion");
  const [comparisons, setComparisons] = useState<string[]>(DEFAULT_COMPARISON_PLATFORMS);
  const [appStoreId, setAppStoreId] = useState("");
  const [playPackage, setPlayPackage] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  function toggleComparison(name: string) {
    setComparisons((current) =>
      current.includes(name) ? current.filter((c) => c !== name) : [...current, name]
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!productName.trim() || loading) return;
    onSubmit({
      productName: productName.trim(),
      comparisonPlatforms: comparisons,
      appStoreId: appStoreId.trim(),
      playPackage: playPackage.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-de-border bg-de-surface p-5">
      <label htmlFor="productName" className="block text-xs font-medium uppercase tracking-wide text-de-text-muted">
        Primary platform
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
          {loading ? "Running…" : "Run analysis"}
        </button>
      </div>

      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-de-text-muted">Comparison corpus</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {SUGGESTED_COMPARISONS.map((name) => {
          const on = comparisons.includes(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => toggleComparison(name)}
              className={
                on
                  ? "rounded-lg bg-de-accent/20 px-3 py-1.5 text-xs font-semibold text-de-accent ring-1 ring-de-accent/40"
                  : "rounded-lg border border-de-border px-3 py-1.5 text-xs text-de-text-muted hover:text-de-text-secondary"
              }
            >
              {on ? "✓ " : "+ "}
              {name}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-de-text-muted">
        The brief is about online fashion shopping, not one retailer. Comparison platforms are collected and labelled
        separately so every theme can be read as a platform problem or a category problem.
      </p>

      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        className="mt-3 text-xs font-medium text-de-text-muted underline decoration-de-border underline-offset-4 hover:text-de-text-secondary"
      >
        {advancedOpen ? "Hide" : "Show"} advanced (exact App Store ID / Play package for the primary platform)
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
              placeholder="resolved by name if left blank"
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
