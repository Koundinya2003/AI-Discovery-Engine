import { describe, expect, it } from "vitest";
import type { CollectedItem } from "@/lib/types";
import { buildBatchPrompt, buildClassifySystemPrompt, validateBatch } from "./classify";

function item(id: string, source: CollectedItem["source"] = "play_store"): CollectedItem {
  return {
    id,
    source,
    sourceLabel: source,
    platform: "Nykaa Fashion",
    text: `text for ${id}`,
    url: "https://example.com",
  };
}

describe("validateBatch", () => {
  const batch = [item("1"), item("2")];
  const validCodes = new Set(["ABC", "OTH"]);

  it("falls back to OTH for an unrecognised theme code", () => {
    const tags = validateBatch(
      { results: [{ id: "1", themeCode: "ZZZ", frame: ["FIT_SIZE"], sentiment: "positive", confidence: 0.9 }] },
      batch,
      validCodes
    );
    expect(tags.find((t) => t.itemId === "1")?.themeCode).toBe("OTH");
  });

  it("leaves an item the model dropped UNCLASSIFIED rather than labelling it OTH", () => {
    // This is the credibility fix: a missing tag means the model never
    // answered, which is not the same finding as "the model saw nothing".
    const tags = validateBatch(
      { results: [{ id: "1", themeCode: "ABC", frame: ["OTHER"], sentiment: "positive", confidence: 0.9 }] },
      batch,
      validCodes
    );
    expect(tags).toHaveLength(1);
    expect(tags.find((t) => t.itemId === "2")).toBeUndefined();
  });

  it("keeps only frame codes that exist in the taxonomy", () => {
    const tags = validateBatch(
      { results: [{ id: "1", themeCode: "ABC", frame: ["FIT_SIZE", "NOT_A_CODE"], sentiment: "neutral" }] },
      batch,
      validCodes
    );
    expect(tags[0].deductive).toEqual(["FIT_SIZE"]);
  });

  it("defaults an empty or missing frame to OTHER", () => {
    const tags = validateBatch({ results: [{ id: "1", themeCode: "ABC", sentiment: "neutral" }] }, batch, validCodes);
    expect(tags[0].deductive).toEqual(["OTHER"]);
  });

  it("normalises an unknown sentiment to neutral", () => {
    const tags = validateBatch(
      { results: [{ id: "1", themeCode: "ABC", frame: ["OTHER"], sentiment: "furious" }] },
      batch,
      validCodes
    );
    expect(tags[0].sentiment).toBe("neutral");
  });

  it("clamps confidence to [0, 1]", () => {
    const tags = validateBatch(
      { results: [{ id: "1", themeCode: "ABC", frame: ["OTHER"], sentiment: "positive", confidence: 5 }] },
      batch,
      validCodes
    );
    expect(tags[0].confidence).toBe(1);
  });

  it("ignores ids that weren't in the batch, and duplicate rows", () => {
    const tags = validateBatch(
      {
        results: [
          { id: "1", themeCode: "ABC", frame: ["OTHER"], sentiment: "neutral" },
          { id: "1", themeCode: "OTH", frame: ["OTHER"], sentiment: "neutral" },
          { id: "999", themeCode: "ABC", frame: ["OTHER"], sentiment: "neutral" },
        ],
      },
      batch,
      validCodes
    );
    expect(tags).toHaveLength(1);
    expect(tags[0].themeCode).toBe("ABC");
  });

  it("throws when the results field is missing", () => {
    expect(() => validateBatch({}, batch, validCodes)).toThrow();
  });

  it("throws when no returned row matches the batch, so the retry path can run", () => {
    expect(() => validateBatch({ results: [{ id: "nope", themeCode: "ABC" }] }, batch, validCodes)).toThrow();
  });
});

describe("classification prompts", () => {
  it("asks for both axes and names the fixed frame", () => {
    const prompt = buildClassifySystemPrompt([{ code: "ABC", title: "t", definition: "d" }]);
    expect(prompt).toContain("AXIS 1");
    expect(prompt).toContain("AXIS 2");
    expect(prompt).toContain("FIT_SIZE");
    expect(prompt).toContain("ABC: t — d");
  });

  it("json-escapes item ids and text so a quote can't break the prompt", () => {
    const prompt = buildBatchPrompt([{ ...item('we"ird'), text: 'he said "no"' }]);
    expect(prompt).toContain('"we\\"ird"');
    expect(prompt).toContain('he said \\"no\\"');
  });
});
