import { describe, expect, it } from "vitest";
import type { CollectedItem } from "./types";
import { dedupe, inferShopperType, labelCorpus, normalizeForDedupe, ratingBand, recencyBand } from "./corpus";

function item(over: Partial<CollectedItem> = {}): CollectedItem {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    source: "play_store",
    sourceLabel: "play_store",
    platform: "Nykaa Fashion",
    text: "Some review text about sizing",
    url: "https://example.test",
    ...over,
  };
}

describe("dedupe", () => {
  it("removes exact duplicates after normalisation", () => {
    const { items, duplicatesRemoved } = dedupe([
      item({ id: "1", text: "Worst app ever!!!" }),
      item({ id: "2", text: "worst app ever" }),
      item({ id: "3", text: "Great experience" }),
    ]);
    expect(items).toHaveLength(2);
    expect(duplicatesRemoved).toBe(1);
  });

  it("drops empty and sub-3-character items, and counts each one", () => {
    const { items, duplicatesRemoved } = dedupe([
      item({ text: "" }),
      item({ text: "ok" }),
      item({ text: "bad" }),
      item({ text: "Real review" }),
    ]);
    expect(items.map((i) => i.text)).toEqual(["bad", "Real review"]);
    expect(duplicatesRemoved).toBe(2);
  });

  it("keeps the first occurrence", () => {
    const { items } = dedupe([item({ id: "first", text: "same" }), item({ id: "second", text: "same" })]);
    expect(items[0].id).toBe("first");
  });

  it("counts every removal, so scraped − removed always equals kept", () => {
    const input = [
      item({ text: "a duplicate line" }),
      item({ text: "A DUPLICATE LINE" }),
      item({ text: "" }),
      item({ text: "unique one" }),
    ];
    const { items, duplicatesRemoved } = dedupe(input);
    expect(items.length + duplicatesRemoved).toBe(input.length);
  });
});

describe("normalizeForDedupe", () => {
  it("strips urls, punctuation and case", () => {
    expect(normalizeForDedupe("Great! https://x.test  APP")).toBe("great app");
  });
});

describe("ratingBand", () => {
  it("bands ratings and marks unrated sources", () => {
    expect(ratingBand(1)).toBe("detractor");
    expect(ratingBand(2)).toBe("detractor");
    expect(ratingBand(3)).toBe("passive");
    expect(ratingBand(5)).toBe("promoter");
    expect(ratingBand(undefined)).toBe("unrated");
    expect(ratingBand(Number.NaN)).toBe("unrated");
  });
});

describe("recencyBand", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");

  it("buckets by age", () => {
    expect(recencyBand("2025-12-15T00:00:00Z", now)).toBe("last_90d");
    expect(recencyBand("2025-06-01T00:00:00Z", now)).toBe("last_year");
    expect(recencyBand("2020-01-01T00:00:00Z", now)).toBe("older");
  });

  it("returns unknown for missing or unparseable dates", () => {
    expect(recencyBand(undefined, now)).toBe("unknown");
    expect(recencyBand("not a date", now)).toBe("unknown");
  });

  it("treats a future timestamp as fresh rather than unknown", () => {
    expect(recencyBand("2026-01-02T00:00:00Z", now)).toBe("last_90d");
  });
});

describe("inferShopperType", () => {
  it("only assigns a type when the text names it", () => {
    expect(inferShopperType("Nice app")).toBeNull();
  });

  it("recognises the evidenced types", () => {
    expect(inferShopperType("Need an outfit for a wedding")).toBe("occasion_buyer");
    expect(inferShopperType("The size chart is wrong")).toBe("size_conscious");
    expect(inferShopperType("My wishlist keeps growing")).toBe("list_builder");
    expect(inferShopperType("Buying a gift for my sister")).toBe("gifter");
    expect(inferShopperType("Waiting for a discount")).toBe("value_seeker");
    expect(inferShopperType("I returned it immediately")).toBe("returner");
  });

  it("prefers the more specific rule when two match", () => {
    expect(inferShopperType("Wedding outfit, hoping for a discount")).toBe("occasion_buyer");
  });
});

describe("labelCorpus", () => {
  it("gives every item deductive labels and derived bands", () => {
    const labelled = labelCorpus([item({ text: "great", rating: 5, date: "2025-12-01T00:00:00Z" })], Date.parse("2026-01-01T00:00:00Z"));
    expect(labelled).toHaveLength(1);
    expect(labelled[0].deductive.length).toBeGreaterThan(0);
    expect(labelled[0].ratingBand).toBe("promoter");
    expect(labelled[0].recency).toBe("last_90d");
    expect(labelled[0].themeCode).toBeNull();
    expect(labelled[0].sampled).toBe(false);
  });
});
