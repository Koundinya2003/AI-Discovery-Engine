// CSV / JSON export of a run's classified items.
//
// The CSV is the artifact someone pastes into a spreadsheet to check a number
// from the deck, so every column that feeds a score is present: both
// taxonomies, the bands the segment cuts use, and the source URL.

import type { RunResult } from "@/lib/types";

export const CSV_COLUMNS = [
  "item_id",
  "platform",
  "source",
  "source_label",
  "rating",
  "rating_band",
  "date",
  "recency_band",
  "shopper_type",
  "deductive_labels",
  "inductive_theme",
  "sentiment",
  "in_llm_sample",
  "url",
  "text",
] as const;

/** RFC4180 escaping: quote everything, double any embedded quote. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const s = String(value).replace(/\r?\n/g, " ").replace(/"/g, '""');
  return `"${s}"`;
}

export function toCsv(run: RunResult): string {
  const themeTitle = new Map(run.themes.map((t) => [t.code, t.title]));
  const rows = run.corpus.map((item) =>
    [
      item.id,
      item.platform,
      item.source,
      item.sourceLabel,
      item.rating ?? "",
      item.ratingBand,
      item.date ?? "",
      item.recency,
      item.shopperType ?? "",
      item.deductive.join("|"),
      item.themeCode ? `${item.themeCode} — ${themeTitle.get(item.themeCode) ?? ""}`.trim() : "",
      item.sentiment ?? "",
      item.sampled ? "yes" : "no",
      item.url,
      item.text,
    ]
      .map(csvCell)
      .join(",")
  );

  return [CSV_COLUMNS.join(","), ...rows].join("\n");
}

/** Ranked opportunity table as markdown, ready to paste into a slide. */
export function toOpportunityMarkdown(run: RunResult, taxonomy: "deductive" | "inductive"): string {
  const rows = taxonomy === "deductive" ? run.deductive : run.themes;
  if (rows.length === 0) return "_No themes in this taxonomy for this run._";

  const header =
    "| # | Theme | Volume | Share | Mean ★ | Platform split | Prev | Sev | Bre | Size | Lev | Opportunity |\n" +
    "|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|";

  const body = rows
    .map((r, i) => {
      const split = r.platformSplit
        .slice(0, 4)
        .map((p) => `${p.platform} ${Math.round(p.share * 100)}%`)
        .join(", ");
      const c = r.components;
      return `| ${i + 1} | **${r.code}** — ${r.title} | ${r.volume} | ${(r.shareOfCorpus * 100).toFixed(1)}% | ${
        r.meanRating ?? "—"
      } | ${split} | ${c.prevalence.toFixed(2)} | ${c.severity.toFixed(2)} | ${c.breadth.toFixed(
        2
      )} | ${c.problemSize.toFixed(2)} | ${c.leverage.toFixed(2)} | **${r.opportunityScore.toFixed(1)}** |`;
    })
    .join("\n");

  const denom = rows[0]?.denominator ?? 0;
  return `${header}\n${body}\n\n_Share is of ${denom} ${
    taxonomy === "deductive" ? "analysed items (multi-label, so shares sum above 100%)" : "model-classified items"
  }. ${run.scoring.formula}_`;
}

export function exportFilename(run: RunResult, ext: string): string {
  const slug = run.productName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `discovery-${slug || "run"}-${run.runId}.${ext}`;
}
