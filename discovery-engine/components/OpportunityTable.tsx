"use client";

import { useMemo, useState } from "react";
import type { OpportunityRow, RunResult } from "@/lib/types";

type SortKey = "opportunityScore" | "volume" | "shareOfCorpus" | "meanRating";

const COMPONENT_HEADERS: Array<{ key: keyof OpportunityRow["components"]; label: string; title: string }> = [
  { key: "prevalence", label: "Prev", title: "Prevalence — share of corpus, normalised to the largest theme" },
  { key: "severity", label: "Sev", title: "Severity — share of the theme's rated items at 1-2★" },
  { key: "breadth", label: "Bre", title: "Breadth — platforms carrying the theme ÷ platforms in the run" },
  { key: "problemSize", label: "Size", title: "Problem size — 0.50·Prev + 0.30·Sev + 0.20·Bre" },
  { key: "leverage", label: "Lev", title: "Leverage — how directly the theme sits between saving and buying; multiplies the size" },
];

/**
 * The decision instrument. Every column that feeds the score is visible next
 * to the score, and the formula is printed above the table, so a reader can
 * disagree with a weight instead of with the conclusion.
 */
export default function OpportunityTable({
  rows,
  scoring,
  caption,
}: {
  rows: OpportunityRow[];
  scoring: RunResult["scoring"];
  caption: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("opportunityScore");

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const an = typeof av === "number" ? av : -1;
      const bn = typeof bv === "number" ? bv : -1;
      return bn - an;
    });
  }, [rows, sortKey]);

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-de-border bg-de-surface p-4 text-xs text-de-text-muted">
        No rows in this taxonomy for this run.
      </p>
    );
  }

  const denominator = rows[0].denominator;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-de-border bg-de-surface px-4 py-3">
        <p className="font-mono text-[11px] leading-relaxed text-de-text-secondary">{scoring.formula}</p>
        <p className="mt-1.5 text-[11px] text-de-text-muted">
          {caption} Shares are of {denominator} items.{" "}
          <a href="/methodology" className="text-de-accent underline underline-offset-2">
            How each component is computed →
          </a>
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-de-border bg-de-surface">
        <table className="w-full min-w-[54rem] text-left text-xs">
          <thead className="text-de-text-muted">
            <tr className="border-b border-de-border">
              <th className="px-3 py-2.5 font-medium">#</th>
              <th className="px-3 py-2.5 font-medium">Theme</th>
              <SortableHeader label="Volume" active={sortKey === "volume"} onClick={() => setSortKey("volume")} />
              <SortableHeader
                label="Share"
                active={sortKey === "shareOfCorpus"}
                onClick={() => setSortKey("shareOfCorpus")}
              />
              <SortableHeader
                label="Mean ★"
                active={sortKey === "meanRating"}
                onClick={() => setSortKey("meanRating")}
              />
              <th className="px-3 py-2.5 font-medium">Platform split</th>
              {COMPONENT_HEADERS.map((c) => (
                <th key={c.key} className="px-2 py-2.5 text-right font-medium" title={c.title}>
                  {c.label}
                </th>
              ))}
              <SortableHeader
                label="Opportunity"
                active={sortKey === "opportunityScore"}
                onClick={() => setSortKey("opportunityScore")}
              />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={row.code} className="border-b border-de-border/50 last:border-0 align-top">
                <td className="px-3 py-2.5 tabular-nums text-de-text-muted">{i + 1}</td>
                <td className="px-3 py-2.5">
                  <span className="font-semibold text-de-text-primary">{row.code}</span>
                  <span className="text-de-text-secondary"> — {row.title}</span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-de-text-primary">{row.volume}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-de-text-secondary">
                  {(row.shareOfCorpus * 100).toFixed(1)}%
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-de-text-secondary">
                  {row.meanRating === null ? (
                    <span className="text-de-text-muted" title="No rated items carry this theme">
                      —
                    </span>
                  ) : (
                    `${row.meanRating.toFixed(2)} (n=${row.ratedCount})`
                  )}
                </td>
                <td className="px-3 py-2.5 text-de-text-secondary">
                  {row.platformSplit
                    .slice(0, 3)
                    .map((p) => `${p.platform} ${Math.round(p.share * 100)}%`)
                    .join(" · ")}
                </td>
                {COMPONENT_HEADERS.map((c) => (
                  <td key={c.key} className="px-2 py-2.5 text-right tabular-nums text-de-text-muted">
                    {row.components[c.key].toFixed(2)}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-right">
                  <span className="font-semibold tabular-nums text-de-text-primary">
                    {row.opportunityScore.toFixed(1)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortableHeader({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <th className="px-3 py-2.5 text-right font-medium">
      <button
        type="button"
        onClick={onClick}
        className={active ? "text-de-accent underline underline-offset-4" : "hover:text-de-text-secondary"}
      >
        {label}
      </button>
    </th>
  );
}
