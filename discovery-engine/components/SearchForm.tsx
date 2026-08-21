"use client";

import { useState, type FormEvent } from "react";

export type SearchFormValues = {
  productName: string;
  appStoreId: string;
  playPackage: string;
};

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

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!productName.trim() || loading) return;
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
