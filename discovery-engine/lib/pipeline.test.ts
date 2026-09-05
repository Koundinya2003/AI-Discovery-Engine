import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectedItem, ProgressEvent } from "./types";

// Every network-touching module is mocked, so this exercises the real
// dedupe -> label -> sample -> score path end to end with no live calls.
const collectAppStore = vi.fn();
const collectPlayStore = vi.fn();
const collectReddit = vi.fn();
const collectYouTube = vi.fn();
const discoverThemes = vi.fn();
const classifyItems = vi.fn();

vi.mock("./collectors/app_store", () => ({ collectAppStore: (...a: unknown[]) => collectAppStore(...a) }));
vi.mock("./collectors/play_store", () => ({ collectPlayStore: (...a: unknown[]) => collectPlayStore(...a) }));
vi.mock("./collectors/reddit", () => ({ collectReddit: (...a: unknown[]) => collectReddit(...a) }));
vi.mock("./collectors/youtube", () => ({
  collectYouTube: (...a: unknown[]) => collectYouTube(...a),
  isYouTubeConfigured: () => false,
}));
vi.mock("./groq/themes", () => ({ discoverThemes: (...a: unknown[]) => discoverThemes(...a) }));
vi.mock("./groq/classify", () => ({
  CLASSIFY_MAX_ITEMS: 4,
  classifyItems: (...a: unknown[]) => classifyItems(...a),
}));

import { runPipeline } from "./pipeline";

function review(id: string, text: string, platform: string, rating?: number): CollectedItem {
  return {
    id,
    source: "play_store",
    sourceLabel: "play_store",
    platform,
    text,
    rating,
    date: "2025-12-01T00:00:00Z",
    url: "https://example.test",
  };
}

const FIT = "The size chart is wrong and everything runs small, sizing is inconsistent";
const LOG = "Refund not processed, the return pickup never came and customer care is useless";

beforeEach(() => {
  for (const m of [collectAppStore, collectPlayStore, collectReddit, collectYouTube, discoverThemes, classifyItems]) {
    m.mockReset();
  }
  delete process.env.GROQ_API_KEY;

  collectPlayStore.mockImplementation(async (platform: { label: string }) => ({
    items: [
      review(`p1-${platform.label}`, `${FIT} (${platform.label})`, platform.label, 1),
      review(`p2-${platform.label}`, `${LOG} (${platform.label})`, platform.label, 2),
      review(`p3-${platform.label}`, `Lovely app, no complaints (${platform.label})`, platform.label, 5),
    ],
    resolvedTitle: `${platform.label}: Online Shopping`,
  }));
  collectAppStore.mockRejectedValue(new Error("itunes search empty"));
  collectReddit.mockResolvedValue({
    items: [
      {
        id: "r1",
        source: "reddit",
        sourceLabel: "r/IndianFashionAddicts",
        platform: "Cross-platform",
        text: "Should I buy this kurta? My wishlist is a graveyard, I never buy from it",
        url: "https://reddit.test/1",
        date: "2025-11-01T00:00:00Z",
      },
    ],
    breakdown: [{ label: "r/IndianFashionAddicts", count: 1 }],
    rejected: [{ label: "off-topic for fashion", count: 7 }],
  });
});

afterEach(() => {
  delete process.env.GROQ_API_KEY;
});

async function run(comparisons = ["Myntra"]) {
  const events: ProgressEvent[] = [];
  const result = await runPipeline(
    { productName: "Nykaa Fashion", comparisonPlatforms: comparisons, runId: "test-run" },
    (e) => events.push(e)
  );
  return { result, events };
}

describe("runPipeline", () => {
  it("classifies 100% of the analysed corpus deductively, with no silent drops", async () => {
    const { result } = await run();
    const { coverage } = result;
    expect(coverage.analysed).toBe(coverage.scraped - coverage.duplicatesRemoved);
    expect(coverage.deductivelyClassified).toBe(coverage.analysed);
    expect(coverage.deductiveCoveragePct).toBe(100);
    expect(result.corpus.every((i) => i.deductive.length > 0)).toBe(true);
  });

  it("collects every requested platform and labels each item with its own", async () => {
    const { result } = await run(["Myntra", "AJIO"]);
    expect(result.platforms).toEqual(["Nykaa Fashion", "Myntra", "AJIO"]);
    expect(new Set(result.corpus.map((i) => i.platform))).toEqual(
      new Set(["Nykaa Fashion", "Myntra", "AJIO", "Cross-platform"])
    );
  });

  it("ignores a comparison platform that duplicates the primary", async () => {
    const { result } = await run(["Nykaa Fashion", "Myntra"]);
    expect(result.platforms).toEqual(["Nykaa Fashion", "Myntra"]);
  });

  it("reports a failed source as unavailable with a category and no raw error text", async () => {
    const { result } = await run();
    const appStore = result.sources.find((s) => s.source === "app_store")!;
    expect(appStore.count).toBe(0);
    expect(appStore.unavailable).toBeDefined();
    expect(JSON.stringify(result.sources)).not.toContain("itunes");
    expect(JSON.stringify(result.sources)).not.toMatch(/[A-Z][A-Z0-9]*(_[A-Z0-9]+)+/);
  });

  it("reports an unconfigured source cleanly rather than naming its credential", async () => {
    const { result } = await run();
    const youtube = result.sources.find((s) => s.source === "youtube")!;
    expect(youtube.unavailable?.reason).toBe("not_configured");
    expect(youtube.unavailable?.detail).not.toMatch(/API_KEY|YOUTUBE/i);
    expect(collectYouTube).not.toHaveBeenCalled();
  });

  it("keeps rejected-item counts visible instead of dropping them", async () => {
    const { result } = await run();
    const reddit = result.sources.find((s) => s.source === "reddit")!;
    expect(reddit.rejected).toEqual([{ label: "off-topic for fashion", count: 7 }]);
  });

  it("produces a full opportunity table and segment cuts with no model at all", async () => {
    const { result } = await run();
    expect(result.deductive.length).toBeGreaterThan(0);
    expect(result.themes).toEqual([]);
    expect(result.segments.byPlatform.length).toBeGreaterThan(0);
    expect(result.channels.length).toBe(4);
    expect(result.notices.some((n) => n.message.includes("Inductive theme discovery is unavailable"))).toBe(true);
  });

  it("streams real counts as stages complete", async () => {
    const { events } = await run();
    const stages = events.filter((e) => e.type === "stage").map((e) => (e as { stage: string }).stage);
    expect(stages).toContain("collect");
    expect(stages).toContain("prepare");
    expect(stages).toContain("score");

    const counts = events.filter((e) => e.type === "counts");
    expect(counts.length).toBeGreaterThan(1);
    const last = counts[counts.length - 1] as { scraped: number; analysed: number; sampled: number };
    expect(last.scraped).toBeGreaterThan(0);
    expect(last.sampled).toBeGreaterThan(0);

    const sourceEvents = events.filter((e) => e.type === "source");
    expect(sourceEvents).toHaveLength(4);
  });

  it("caps the LLM sample at the configured budget and says which strata it drew", async () => {
    const { result } = await run(["Myntra", "AJIO"]);
    expect(result.coverage.llmSampled).toBe(4); // CLASSIFY_MAX_ITEMS mocked to 4
    expect(result.coverage.strata.length).toBeGreaterThan(1);
    expect(result.coverage.strata.reduce((s, x) => s + x.drawn, 0)).toBe(4);
    expect(result.coverage.samplingRule).toContain("Stratified by source × platform × rating band");
    expect(result.corpus.filter((i) => i.sampled)).toHaveLength(4);
  });

  it("runs the model layer on exactly the sampled items and reports its coverage honestly", async () => {
    process.env.GROQ_API_KEY = "test-key";
    discoverThemes.mockResolvedValue([
      { code: "SIZE", title: "Sizing roulette", definition: "d" },
      { code: "OTH", title: "Unrelated / other", definition: "d" },
    ]);
    classifyItems.mockImplementation(async (items: CollectedItem[]) => ({
      // Deliberately only tag the first item: the rest must stay unclassified.
      tags: items.slice(0, 1).map((i) => ({
        itemId: i.id,
        themeCode: "SIZE",
        sentiment: "negative" as const,
        confidence: 0.9,
        deductive: ["FIT_SIZE" as const],
      })),
      attempted: items.length,
      failedBatches: 1,
    }));

    const { result } = await run();
    expect(discoverThemes).toHaveBeenCalledTimes(1);
    const sampleGivenToModel = (classifyItems.mock.calls[0][0] as CollectedItem[]).map((i) => i.id).sort();
    const sampleFromThemes = (discoverThemes.mock.calls[0][1] as CollectedItem[]).map((i) => i.id).sort();
    expect(sampleGivenToModel).toEqual(sampleFromThemes);

    expect(result.coverage.llmClassified).toBe(1);
    expect(result.coverage.llmCoveragePct).toBeLessThan(100);
    expect(result.corpus.filter((i) => i.themeCode !== null)).toHaveLength(1);
    expect(result.notices.some((n) => n.message.includes("could not be completed"))).toBe(true);
    // Inductive shares are of what was classified, never of the whole corpus.
    expect(result.themes[0].denominator).toBe(1);
  });

  it("records rule-model agreement instead of assuming the rules are right", async () => {
    process.env.GROQ_API_KEY = "test-key";
    discoverThemes.mockResolvedValue([{ code: "OTH", title: "Unrelated / other", definition: "d" }]);
    classifyItems.mockImplementation(async (items: CollectedItem[]) => ({
      tags: items.map((i, idx) => ({
        itemId: i.id,
        themeCode: "OTH",
        sentiment: "neutral" as const,
        confidence: 0.5,
        // Half agree with the rules, half deliberately don't.
        deductive: idx % 2 === 0 ? (["FIT_SIZE"] as const) : (["BOOKMARKING"] as const),
      })),
      attempted: items.length,
      failedBatches: 0,
    }));

    const { result } = await run();
    expect(result.coverage.ruleModelAudited).toBe(4);
    expect(result.coverage.ruleModelAgreement).not.toBeNull();
    expect(result.coverage.ruleModelAgreement!).toBeGreaterThanOrEqual(0);
    expect(result.coverage.ruleModelAgreement!).toBeLessThanOrEqual(1);
  });

  it("survives every source failing, returning an empty but well-formed run", async () => {
    collectPlayStore.mockRejectedValue(new Error("play store timeout"));
    collectReddit.mockResolvedValue({ items: [], breakdown: [], rejected: undefined, failureReason: "blocked" });

    const { result } = await run();
    expect(result.coverage.scraped).toBe(0);
    expect(result.coverage.analysed).toBe(0);
    expect(result.deductive).toEqual([]);
    expect(result.sources.every((s) => s.unavailable)).toBe(true);
    expect(result.notices.some((n) => n.message.includes("nothing to analyse"))).toBe(true);
  });

  it("de-duplicates identical reviews across platforms and counts the removals", async () => {
    collectPlayStore.mockImplementation(async (platform: { label: string }) => ({
      items: [review(`dup-${platform.label}`, FIT, platform.label, 1)],
      resolvedTitle: platform.label,
    }));

    const { result } = await run(["Myntra"]);
    // Two platforms produce byte-identical text; one survives, one is counted.
    expect(result.coverage.duplicatesRemoved).toBe(1);
    expect(result.coverage.analysed).toBe(result.coverage.scraped - 1);
  });

  it("publishes the scoring manifest with the run so a saved run explains itself", async () => {
    const { result } = await run();
    expect(result.scoring.formula).toContain("Opportunity = 100 ×");
    expect(Object.keys(result.scoring.leverage).length).toBeGreaterThan(5);
  });
});
