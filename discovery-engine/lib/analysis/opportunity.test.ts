import { describe, expect, it } from "vitest";
import type { LabelledItem, Theme } from "@/lib/types";
import { labelCorpus } from "@/lib/corpus";
import {
  SCORING_WEIGHTS,
  buildDeductiveRows,
  buildInductiveRows,
  buildScoringContext,
  derivedLeverage,
  pickQuotes,
  scoringManifest,
} from "./opportunity";

function labelled(over: Partial<LabelledItem> & { text: string }): LabelledItem {
  const [base] = labelCorpus([
    {
      id: over.id ?? Math.random().toString(36).slice(2),
      source: over.source ?? "play_store",
      sourceLabel: over.sourceLabel ?? "play_store",
      platform: over.platform ?? "Nykaa Fashion",
      text: over.text,
      rating: over.rating,
      date: over.date,
      url: over.url ?? "https://example.test",
    },
  ]);
  return { ...base, ...over } as LabelledItem;
}

const FIT = "The size chart is wrong and it runs small, sizing is inconsistent";
const LOG = "Refund not processed, return pickup never came, customer care useless";

describe("buildDeductiveRows", () => {
  it("uses the whole analysed corpus as the denominator", () => {
    const corpus = [labelled({ text: FIT }), labelled({ text: LOG }), labelled({ text: "lovely app" })];
    const rows = buildDeductiveRows(corpus, buildScoringContext(corpus, ["Nykaa Fashion"]));
    for (const row of rows) expect(row.denominator).toBe(3);
  });

  it("counts an item under every label it carries", () => {
    const corpus = [labelled({ text: `${FIT}. ${LOG}` })];
    const rows = buildDeductiveRows(corpus, buildScoringContext(corpus, ["Nykaa Fashion"]));
    const codes = rows.map((r) => r.code);
    expect(codes).toContain("FIT_SIZE");
    expect(codes).toContain("LOGISTICS_CX");
    expect(rows.every((r) => r.volume === 1)).toBe(true);
  });

  it("computes mean rating only over rated items", () => {
    const corpus = [
      labelled({ text: FIT, rating: 1 }),
      labelled({ text: FIT, rating: 3 }),
      labelled({ text: FIT, source: "reddit", sourceLabel: "r/india" }), // unrated
    ];
    const row = buildDeductiveRows(corpus, buildScoringContext(corpus, ["Nykaa Fashion"])).find(
      (r) => r.code === "FIT_SIZE"
    )!;
    expect(row.volume).toBe(3);
    expect(row.ratedCount).toBe(2);
    expect(row.meanRating).toBe(2);
  });

  it("scores breadth by how many platforms carry the theme", () => {
    const corpus = [
      labelled({ text: FIT, platform: "Nykaa Fashion" }),
      labelled({ text: FIT, platform: "Myntra" }),
      labelled({ text: LOG, platform: "Nykaa Fashion" }),
    ];
    const ctx = buildScoringContext(corpus, ["Nykaa Fashion", "Myntra", "AJIO"]);
    const rows = buildDeductiveRows(corpus, ctx);
    expect(rows.find((r) => r.code === "FIT_SIZE")!.components.breadth).toBeCloseTo(2 / 3, 2);
    expect(rows.find((r) => r.code === "LOGISTICS_CX")!.components.breadth).toBeCloseTo(1 / 3, 2);
  });

  it("recomputes to the published formula, exactly", () => {
    const corpus = [labelled({ text: FIT, rating: 1 }), labelled({ text: LOG, rating: 5 })];
    const rows = buildDeductiveRows(corpus, buildScoringContext(corpus, ["Nykaa Fashion"]));
    for (const row of rows) {
      const c = row.components;
      const size =
        SCORING_WEIGHTS.prevalence * c.prevalence +
        SCORING_WEIGHTS.severity * c.severity +
        SCORING_WEIGHTS.breadth * c.breadth;
      expect(c.problemSize).toBeCloseTo(size, 3);
      expect(row.opportunityScore).toBeCloseTo(Number((100 * c.leverage * c.problemSize).toFixed(1)), 5);
    }
  });

  it("scores a zero-leverage theme at zero, whatever its volume", () => {
    const corpus = Array.from({ length: 20 }, (_, i) => labelled({ id: `o${i}`, text: `lovely app ${i}`, rating: 5 }));
    const other = buildDeductiveRows(corpus, buildScoringContext(corpus, ["Nykaa Fashion"])).find(
      (r) => r.code === "OTHER"
    )!;
    expect(other.volume).toBe(20);
    expect(other.opportunityScore).toBe(0);
  });

  it("lets a smaller high-leverage theme outrank a larger post-purchase one", () => {
    // 6 logistics items vs 3 fit items, all equally negative. Volume alone
    // would rank logistics first; leverage is what flips it.
    const corpus = [
      ...Array.from({ length: 6 }, (_, i) => labelled({ id: `l${i}`, text: `${LOG} ${i}`, rating: 1 })),
      ...Array.from({ length: 3 }, (_, i) => labelled({ id: `f${i}`, text: `${FIT} ${i}`, rating: 1 })),
    ];
    const rows = buildDeductiveRows(corpus, buildScoringContext(corpus, ["Nykaa Fashion"]));
    const fit = rows.find((r) => r.code === "FIT_SIZE")!;
    const log = rows.find((r) => r.code === "LOGISTICS_CX")!;
    expect(fit.volume).toBeLessThan(log.volume);
    expect(fit.opportunityScore).toBeGreaterThan(log.opportunityScore);
  });

  it("falls back to the corpus detractor rate when a theme has no rated items", () => {
    const corpus = [
      labelled({ text: FIT, rating: 1 }),
      labelled({ text: FIT, rating: 1 }),
      labelled({ text: LOG, source: "reddit", sourceLabel: "r/india" }),
    ];
    const ctx = buildScoringContext(corpus, ["Nykaa Fashion"]);
    expect(ctx.baselineDetractorRate).toBe(1);
    const log = buildDeductiveRows(corpus, ctx).find((r) => r.code === "LOGISTICS_CX")!;
    expect(log.detractorShare).toBeNull();
    expect(log.components.severity).toBe(1);
  });

  it("returns an empty table for an empty corpus rather than dividing by zero", () => {
    expect(buildDeductiveRows([], buildScoringContext([], []))).toEqual([]);
  });
});

describe("buildInductiveRows", () => {
  const themes: Theme[] = [
    { code: "SIZE", title: "Sizing roulette", definition: "…" },
    { code: "DELV", title: "Delivery delays", definition: "…" },
    { code: "OTH", title: "Unrelated / other", definition: "…" },
  ];

  it("uses only model-classified items as its denominator", () => {
    const corpus = [
      labelled({ text: FIT, themeCode: "SIZE", sentiment: "negative", sampled: true }),
      labelled({ text: LOG, themeCode: "DELV", sentiment: "negative", sampled: true }),
      labelled({ text: "unsampled item about delivery" }), // themeCode stays null
    ];
    const rows = buildInductiveRows(themes, corpus, buildScoringContext(corpus, ["Nykaa Fashion"]));
    expect(rows.every((r) => r.denominator === 2)).toBe(true);
  });

  it("returns nothing when the model classified nothing", () => {
    const corpus = [labelled({ text: FIT })];
    expect(buildInductiveRows(themes, corpus, buildScoringContext(corpus, ["Nykaa Fashion"]))).toEqual([]);
  });

  it("derives leverage from the frame labels its items carry", () => {
    const corpus = [labelled({ text: FIT, themeCode: "SIZE", sampled: true })];
    const rows = buildInductiveRows(themes, corpus, buildScoringContext(corpus, ["Nykaa Fashion"]));
    // FIT_SIZE carries the highest leverage in the frame.
    expect(rows[0].components.leverage).toBe(1);
  });
});

describe("derivedLeverage", () => {
  it("is zero for an empty set", () => {
    expect(derivedLeverage([])).toBe(0);
  });

  it("averages the strongest label per item", () => {
    const corpus = [labelled({ text: FIT }), labelled({ text: "great app" })];
    // FIT_SIZE = 1.0, OTHER = 0 -> mean 0.5
    expect(derivedLeverage(corpus)).toBeCloseTo(0.5, 5);
  });
});

describe("pickQuotes", () => {
  it("spreads quotes across platform and source before repeating one", () => {
    const items = [
      labelled({ id: "a", text: `${FIT} one`, platform: "Nykaa Fashion" }),
      labelled({ id: "b", text: `${FIT} two`, platform: "Nykaa Fashion" }),
      labelled({ id: "c", text: `${FIT} three`, platform: "Myntra" }),
    ];
    const quotes = pickQuotes(items, 2);
    expect(new Set(quotes.map((q) => q.platform)).size).toBe(2);
  });

  it("never returns more than asked for", () => {
    const items = Array.from({ length: 10 }, (_, i) => labelled({ id: `q${i}`, text: `${FIT} ${i}` }));
    expect(pickQuotes(items, 3)).toHaveLength(3);
  });
});

describe("scoringManifest", () => {
  it("publishes problem-size weights that sum to 1, plus a formula string", () => {
    const manifest = scoringManifest();
    const sum = Object.values(manifest.weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
    expect(manifest.formula).toContain("Opportunity");
    expect(Object.keys(manifest.leverage).length).toBeGreaterThan(5);
  });
});

describe("the inductive catch-all", () => {
  it("never heads the ranking, however large it grows", () => {
    const themes: Theme[] = [
      { code: "SIZE", title: "Sizing roulette", definition: "…" },
      { code: "OTH", title: "Unrelated / other", definition: "…" },
    ];
    const corpus = [
      ...Array.from({ length: 9 }, (_, i) =>
        labelled({ id: `o${i}`, text: `${FIT} ${i}`, themeCode: "OTH", sampled: true, rating: 1 })
      ),
      labelled({ id: "s1", text: FIT, themeCode: "SIZE", sampled: true, rating: 1 }),
    ];
    const rows = buildInductiveRows(themes, corpus, buildScoringContext(corpus, ["Nykaa Fashion"]));
    const oth = rows.find((r) => r.code === "OTH")!;
    const size = rows.find((r) => r.code === "SIZE")!;
    expect(oth.volume).toBeGreaterThan(size.volume);
    expect(oth.components.leverage).toBe(0);
    expect(oth.opportunityScore).toBe(0);
    expect(rows[0].code).toBe("SIZE");
  });

  it("still appears in the table, so classified counts stay honest", () => {
    const themes: Theme[] = [{ code: "OTH", title: "Unrelated / other", definition: "…" }];
    const corpus = [labelled({ id: "o1", text: "lovely", themeCode: "OTH", sampled: true })];
    const rows = buildInductiveRows(themes, corpus, buildScoringContext(corpus, ["Nykaa Fashion"]));
    expect(rows.map((r) => r.code)).toEqual(["OTH"]);
    expect(rows[0].volume).toBe(1);
  });
});
