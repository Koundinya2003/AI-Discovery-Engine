import { describe, expect, it } from "vitest";
import type { CollectedItem } from "@/lib/types";
import { labelCorpus } from "@/lib/corpus";
import { buildSegments, hasPrePurchaseSignal } from "./segments";

const NOW = Date.parse("2026-01-01T00:00:00Z");

function raw(over: Partial<CollectedItem> & { text: string }): CollectedItem {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    source: over.source ?? "play_store",
    sourceLabel: over.sourceLabel ?? "play_store",
    platform: over.platform ?? "Nykaa Fashion",
    text: over.text,
    rating: over.rating,
    date: over.date,
    url: "https://example.test",
  };
}

const FIT = "The size chart is wrong and it runs small";
const LOG = "Refund not processed and the return pickup never came";

describe("buildSegments", () => {
  const corpus = labelCorpus(
    [
      raw({ id: "1", text: FIT, platform: "Nykaa Fashion", rating: 1, date: "2025-12-01T00:00:00Z" }),
      raw({ id: "2", text: LOG, platform: "Nykaa Fashion", rating: 2, date: "2025-12-01T00:00:00Z" }),
      raw({ id: "3", text: LOG, platform: "Myntra", rating: 5, date: "2024-01-01T00:00:00Z" }),
      raw({
        id: "4",
        text: "Should I buy this kurta for a wedding? Need opinions",
        platform: "Cross-platform",
        source: "reddit",
        sourceLabel: "r/IndianFashionAddicts",
      }),
      // Carries no shopper-type evidence at all — must stay un-inferred.
      raw({ id: "5", text: "The app keeps crashing on checkout", platform: "AJIO", rating: 3, date: "2025-09-01T00:00:00Z" }),
    ],
    NOW
  );

  it("cuts by platform with shares of the whole corpus", () => {
    const rows = buildSegments(corpus).byPlatform;
    expect(rows.map((r) => r.segment).sort()).toEqual(["AJIO", "Cross-platform", "Myntra", "Nykaa Fashion"]);
    expect(rows.reduce((sum, r) => sum + r.count, 0)).toBe(5);
    expect(rows.find((r) => r.segment === "Nykaa Fashion")!.share).toBeCloseTo(0.4, 3);
  });

  it("cuts by rating band in a fixed, meaningful order", () => {
    const rows = buildSegments(corpus).byRatingBand;
    expect(rows[0].segment).toContain("detractor");
    expect(rows.find((r) => r.segment.includes("detractor"))!.count).toBe(2);
    expect(rows.find((r) => r.segment.includes("passive"))!.count).toBe(1);
    expect(rows.find((r) => r.segment.includes("Unrated"))!.count).toBe(1);
  });

  it("cuts by recency", () => {
    const rows = buildSegments(corpus).byRecency;
    expect(rows.find((r) => r.segment === "Last 90 days")!.count).toBe(2);
    expect(rows.find((r) => r.segment === "91-365 days")!.count).toBe(1);
    expect(rows.find((r) => r.segment === "Over a year old")!.count).toBe(1);
    expect(rows.find((r) => r.segment === "No date available")!.count).toBe(1);
  });

  it("labels un-inferable shopper types rather than guessing one", () => {
    const rows = buildSegments(corpus).byShopperType;
    const segments = rows.map((r) => r.segment);
    expect(segments).toContain("Not inferable from text");
  });

  it("reports the pre-purchase share per segment", () => {
    const rows = buildSegments(corpus).byPlatform;
    // The community post is the pre-purchase one.
    expect(rows.find((r) => r.segment === "Cross-platform")!.prePurchaseShare).toBe(1);
  });

  it("computes mean rating only over rated items in the segment", () => {
    const rows = buildSegments(corpus).byPlatform;
    expect(rows.find((r) => r.segment === "Nykaa Fashion")!.meanRating).toBe(1.5);
    expect(rows.find((r) => r.segment === "Cross-platform")!.meanRating).toBeNull();
  });

  it("handles an empty corpus without dividing by zero", () => {
    const empty = buildSegments([]);
    expect(empty.byPlatform).toEqual([]);
    expect(empty.byRatingBand).toEqual([]);
  });
});

describe("hasPrePurchaseSignal", () => {
  it("is true for a fit question and false for a pure delivery complaint", () => {
    const [fit] = labelCorpus([raw({ text: FIT })], NOW);
    const [log] = labelCorpus([raw({ text: "Delivery was late and the courier was rude, refund please" })], NOW);
    expect(hasPrePurchaseSignal(fit)).toBe(true);
    expect(hasPrePurchaseSignal(log)).toBe(false);
  });
});
