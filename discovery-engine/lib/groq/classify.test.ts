import { describe, expect, it } from "vitest";
import type { CollectedItem } from "@/lib/types";
import { validateBatch, pickWorkingSet } from "./classify";

function item(id: string, source: CollectedItem["source"] = "play_store"): CollectedItem {
  return { id, source, sourceLabel: source, text: `text for ${id}`, url: "https://example.com" };
}

describe("validateBatch", () => {
  const batch = [item("1"), item("2")];
  const validCodes = new Set(["ABC", "OTH"]);

  it("falls back to OTH for an unrecognized theme code", () => {
    const tags = validateBatch({ results: [{ id: "1", themeCode: "ZZZ", sentiment: "positive", confidence: 0.9 }] }, batch, validCodes);
    expect(tags.find((t) => t.itemId === "1")?.themeCode).toBe("OTH");
  });

  it("still tags an item the model dropped from its response", () => {
    const tags = validateBatch({ results: [{ id: "1", themeCode: "ABC", sentiment: "positive", confidence: 0.9 }] }, batch, validCodes);
    const dropped = tags.find((t) => t.itemId === "2");
    expect(dropped).toEqual({ itemId: "2", themeCode: "OTH", sentiment: "neutral", confidence: 0 });
  });

  it("clamps confidence to [0, 1]", () => {
    const tags = validateBatch(
      { results: [{ id: "1", themeCode: "ABC", sentiment: "positive", confidence: 5 }] },
      batch,
      validCodes
    );
    expect(tags.find((t) => t.itemId === "1")?.confidence).toBe(1);
  });

  it("throws when the results field is missing", () => {
    expect(() => validateBatch({}, batch, validCodes)).toThrow();
  });
});

describe("pickWorkingSet", () => {
  it("returns everything when under the cap", () => {
    const items = [item("1"), item("2")];
    expect(pickWorkingSet(items, 10)).toHaveLength(2);
  });

  it("caps the total and stratifies across sources", () => {
    const items = [
      ...Array.from({ length: 10 }, (_, i) => item(`play_${i}`, "play_store")),
      ...Array.from({ length: 10 }, (_, i) => item(`yt_${i}`, "youtube")),
    ];
    const picked = pickWorkingSet(items, 6);
    expect(picked).toHaveLength(6);
    expect(picked.filter((i) => i.source === "play_store").length).toBeGreaterThan(0);
    expect(picked.filter((i) => i.source === "youtube").length).toBeGreaterThan(0);
  });
});
