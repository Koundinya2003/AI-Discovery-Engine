"use client";

import { useState } from "react";
import type { SegmentCuts, SegmentRow } from "@/lib/types";

const CUTS: Array<{ key: keyof SegmentCuts; label: string; note: string }> = [
  { key: "byPlatform", label: "By platform", note: "Is this a Nykaa problem or a category problem?" },
  { key: "byRatingBand", label: "By rating band", note: "What detractors raise vs. what promoters raise." },
  { key: "byRecency", label: "By recency", note: "Whether a theme is current or historic." },
  {
    key: "byShopperType",
    label: "By inferred shopper type",
    note: "Assigned only where the text names it; everything else stays 'not inferable'.",
  },
];

export default function SegmentPanel({ segments }: { segments: SegmentCuts }) {
  const [active, setActive] = useState<keyof SegmentCuts>("byPlatform");
  const rows = segments[active];
  const note = CUTS.find((c) => c.key === active)?.note ?? "";

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-de-text-muted">Segment cuts</h2>

      <div className="flex flex-wrap gap-2">
        {CUTS.map((cut) => (
          <button
            key={cut.key}
            type="button"
            onClick={() => setActive(cut.key)}
            className={
              active === cut.key
                ? "rounded-lg bg-de-accent px-3 py-1.5 text-xs font-semibold text-white"
                : "rounded-lg border border-de-border bg-de-surface px-3 py-1.5 text-xs text-de-text-secondary hover:text-de-text-primary"
            }
          >
            {cut.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-de-text-muted">{note}</p>

      <div className="overflow-x-auto rounded-xl border border-de-border bg-de-surface">
        <table className="w-full min-w-[44rem] text-left text-xs">
          <thead className="text-de-text-muted">
            <tr className="border-b border-de-border">
              <th className="px-3 py-2.5 font-medium">Segment</th>
              <th className="px-3 py-2.5 text-right font-medium">Items</th>
              <th className="px-3 py-2.5 text-right font-medium">Share</th>
              <th className="px-3 py-2.5 text-right font-medium">Mean ★</th>
              <th
                className="px-3 py-2.5 text-right font-medium"
                title="Share of the segment carrying at least one pre-purchase frame label"
              >
                Pre-purchase
              </th>
              <th className="px-3 py-2.5 font-medium">Top frame labels</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <SegmentTableRow key={row.segment} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SegmentTableRow({ row }: { row: SegmentRow }) {
  return (
    <tr className="border-b border-de-border/50 align-top last:border-0">
      <td className="px-3 py-2.5 text-de-text-primary">{row.segment}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-de-text-secondary">{row.count}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-de-text-secondary">{(row.share * 100).toFixed(1)}%</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-de-text-secondary">
        {row.meanRating === null ? "—" : row.meanRating.toFixed(2)}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-de-text-secondary">
        {(row.prePurchaseShare * 100).toFixed(0)}%
      </td>
      <td className="px-3 py-2.5 text-de-text-muted">
        {row.topLabels.map((l) => `${l.code} ${Math.round(l.share * 100)}%`).join(" · ")}
      </td>
    </tr>
  );
}
