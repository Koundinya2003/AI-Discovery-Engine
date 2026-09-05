import { describe, expect, it } from "vitest";
import type { RunResult } from "./types";
import { CSV_COLUMNS, csvCell, exportFilename, toCsv, toOpportunityMarkdown } from "./export";
import { labelCorpus } from "./corpus";
import { buildDeductiveRows, buildScoringContext, scoringManifest } from "./analysis/opportunity";
import { buildSegments } from "./analysis/segments";

function makeRun(): RunResult {
  const corpus = labelCorpus([
    {
      id: "play_store_nykaa_fashion_1",
      source: "play_store",
      sourceLabel: "play_store",
      platform: "Nykaa Fashion",
      text: 'The "size chart" is wrong,\nit runs small',
      rating: 2,
      date: "2025-12-01T00:00:00Z",
      url: "https://play.google.com/store/apps/details?id=com.fsn.nds",
    },
  ]);
  const ctx = buildScoringContext(corpus, ["Nykaa Fashion"]);

  return {
    runId: "abc123",
    createdAt: "2026-01-01T00:00:00Z",
    productName: "Nykaa Fashion",
    platforms: ["Nykaa Fashion"],
    sources: [],
    coverage: {
      scraped: 1,
      duplicatesRemoved: 0,
      analysed: 1,
      deductivelyClassified: 1,
      deductiveCoveragePct: 100,
      llmSampled: 1,
      llmClassified: 0,
      llmCoveragePct: 0,
      samplingRule: "rule",
      strata: [],
      ruleModelAgreement: null,
      ruleModelAudited: 0,
    },
    themes: [],
    deductive: buildDeductiveRows(corpus, ctx),
    segments: buildSegments(corpus),
    channels: [],
    scoring: scoringManifest(),
    corpus,
    notices: [],
    persisted: false,
  };
}

describe("csvCell", () => {
  it("quotes every value and doubles embedded quotes", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("flattens newlines so a row stays one line", () => {
    expect(csvCell("a\nb")).toBe('"a b"');
  });

  it("renders null and undefined as an empty cell", () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });
});

describe("toCsv", () => {
  it("emits the declared header and one row per corpus item", () => {
    const csv = toCsv(makeRun());
    const lines = csv.split("\n");
    expect(lines[0]).toBe(CSV_COLUMNS.join(","));
    expect(lines).toHaveLength(2);
  });

  it("keeps a quoted, newline-bearing review on a single row", () => {
    const csv = toCsv(makeRun());
    expect(csv.split("\n")).toHaveLength(2);
    expect(csv).toContain('""size chart""');
  });

  it("carries both taxonomies and the sample flag", () => {
    const csv = toCsv(makeRun());
    expect(csv).toContain("FIT_SIZE");
    expect(csv).toContain('"no"'); // in_llm_sample
  });
});

describe("toOpportunityMarkdown", () => {
  it("renders a ranked table with the formula underneath", () => {
    const md = toOpportunityMarkdown(makeRun(), "deductive");
    expect(md).toContain("| # | Theme |");
    expect(md).toContain("FIT_SIZE");
    expect(md).toContain("Opportunity = 100 ×");
  });

  it("says so plainly when a taxonomy is empty", () => {
    expect(toOpportunityMarkdown(makeRun(), "inductive")).toContain("No themes");
  });
});

describe("exportFilename", () => {
  it("slugifies the platform name and includes the run id", () => {
    expect(exportFilename(makeRun(), "csv")).toBe("discovery-nykaa-fashion-abc123.csv");
  });
});
