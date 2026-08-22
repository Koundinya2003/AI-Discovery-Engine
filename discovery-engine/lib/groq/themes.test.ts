import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectedItem } from "@/lib/types";

const callGroqJsonWithRetry = vi.fn();

vi.mock("./client", () => ({
  callGroqJsonWithRetry: (...args: unknown[]) => callGroqJsonWithRetry(...args),
}));

import { validateThemes, discoverThemes } from "./themes";

function item(id: string, text: string): CollectedItem {
  return { id, source: "play_store", sourceLabel: "play_store", text, url: "https://example.com" };
}

describe("validateThemes", () => {
  it("throws when the themes array is missing", () => {
    expect(() => validateThemes({})).toThrow();
  });

  it("adds the OTH catch-all if the model omits it", () => {
    const result = validateThemes({ themes: [{ code: "ABC", title: "Something", definition: "def" }] });
    expect(result.some((t) => t.code === "OTH")).toBe(true);
  });

  it("uppercases and truncates theme codes to 4 chars", () => {
    const result = validateThemes({ themes: [{ code: "abcdef", title: "t", definition: "d" }] });
    expect(result[0].code).toBe("ABCD");
  });
});

describe("discoverThemes", () => {
  const manyThemes = [
    { code: "AAA", title: "a", definition: "a" },
    { code: "BBB", title: "b", definition: "b" },
    { code: "CCC", title: "c", definition: "c" },
    { code: "DDD", title: "d", definition: "d" },
    { code: "OTH", title: "Unrelated / other", definition: "catch-all" },
  ];
  const fewThemes = [{ code: "OTH", title: "Unrelated / other", definition: "catch-all" }];

  const items = Array.from({ length: 5 }, (_, i) => item(String(i), `review number ${i} with enough text to count`));

  beforeEach(() => {
    callGroqJsonWithRetry.mockReset();
  });

  it("returns the first-pass result when it already has enough specific themes", async () => {
    callGroqJsonWithRetry.mockResolvedValueOnce(manyThemes);

    const result = await discoverThemes("Test Product", items);

    expect(callGroqJsonWithRetry).toHaveBeenCalledTimes(1);
    expect(result.themes).toEqual(manyThemes);
    expect(result.sample.length).toBeGreaterThan(0);
  });

  it("retries once with a stronger prompt when too few themes came back, keeping the better result", async () => {
    callGroqJsonWithRetry.mockResolvedValueOnce(fewThemes).mockResolvedValueOnce(manyThemes);

    const result = await discoverThemes("Test Product", items);

    expect(callGroqJsonWithRetry).toHaveBeenCalledTimes(2);
    expect(result.themes).toEqual(manyThemes);
  });

  it("falls back to the first-pass result if the retry call itself fails", async () => {
    callGroqJsonWithRetry.mockResolvedValueOnce(fewThemes).mockRejectedValueOnce(new Error("boom"));

    const result = await discoverThemes("Test Product", items);

    expect(result.themes).toEqual(fewThemes);
  });

  it("returns the same sample the themes were derived from", async () => {
    callGroqJsonWithRetry.mockResolvedValueOnce(manyThemes);

    const result = await discoverThemes("Test Product", items);

    // With only 5 substantive items and SAMPLE_SIZE=80, the sample is every item.
    expect(result.sample.map((i) => i.id).sort()).toEqual(items.map((i) => i.id).sort());
  });
});
