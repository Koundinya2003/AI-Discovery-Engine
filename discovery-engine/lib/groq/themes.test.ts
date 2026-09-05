import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectedItem } from "@/lib/types";

const callGroqJsonWithRetry = vi.fn();

vi.mock("./client", () => ({
  callGroqJsonWithRetry: (...args: unknown[]) => callGroqJsonWithRetry(...args),
}));

import { THEME_SYSTEM_PROMPT, buildThemeUserPrompt, discoverThemes, validateThemes } from "./themes";

function item(id: string, text: string): CollectedItem {
  return {
    id,
    source: "play_store",
    sourceLabel: "play_store",
    platform: "Nykaa Fashion",
    text,
    url: "https://example.com",
  };
}

describe("validateThemes", () => {
  it("throws when the themes array is missing", () => {
    expect(() => validateThemes({})).toThrow();
  });

  it("throws when a theme is missing a field", () => {
    expect(() => validateThemes({ themes: [{ code: "ABC", title: "t" }] })).toThrow();
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

describe("theme prompts", () => {
  it("asks for specific themes across the whole journey, not just post-purchase", () => {
    expect(THEME_SYSTEM_PROMPT).toMatch(/before a purchase/i);
    expect(THEME_SYSTEM_PROMPT).toMatch(/do not invent themes/i);
  });

  it("labels each sampled item with its source and platform", () => {
    const prompt = buildThemeUserPrompt("Nykaa Fashion", [item("1", "the size chart is wrong")]);
    expect(prompt).toContain("[play_store · Nykaa Fashion]");
    expect(prompt).toContain("the size chart is wrong");
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

  const sample = Array.from({ length: 5 }, (_, i) => item(String(i), `review number ${i} with enough text to count`));

  beforeEach(() => {
    callGroqJsonWithRetry.mockReset();
  });

  it("returns the first-pass result when it already has enough specific themes", async () => {
    callGroqJsonWithRetry.mockResolvedValueOnce(manyThemes);
    const result = await discoverThemes("Nykaa Fashion", sample);
    expect(callGroqJsonWithRetry).toHaveBeenCalledTimes(1);
    expect(result).toEqual(manyThemes);
  });

  it("retries once with a stronger prompt when too few themes came back, keeping the better result", async () => {
    callGroqJsonWithRetry.mockResolvedValueOnce(fewThemes).mockResolvedValueOnce(manyThemes);
    const result = await discoverThemes("Nykaa Fashion", sample);
    expect(callGroqJsonWithRetry).toHaveBeenCalledTimes(2);
    expect(result).toEqual(manyThemes);
  });

  it("keeps the first result when the retry comes back no better", async () => {
    callGroqJsonWithRetry.mockResolvedValueOnce(fewThemes).mockResolvedValueOnce(fewThemes);
    expect(await discoverThemes("Nykaa Fashion", sample)).toEqual(fewThemes);
  });

  it("falls back to the first-pass result if the retry call itself fails", async () => {
    callGroqJsonWithRetry.mockResolvedValueOnce(fewThemes).mockRejectedValueOnce(new Error("boom"));
    expect(await discoverThemes("Nykaa Fashion", sample)).toEqual(fewThemes);
  });

  it("does not steer the retry toward post-purchase categories", async () => {
    callGroqJsonWithRetry.mockResolvedValueOnce(fewThemes).mockResolvedValueOnce(manyThemes);
    await discoverThemes("Nykaa Fashion", sample);
    const retryMessages = callGroqJsonWithRetry.mock.calls[1][0] as Array<{ content: string }>;
    const correction = retryMessages[retryMessages.length - 1].content;
    // The old correction named delivery/refunds/app-stability, which pushed an
    // open-ended second pass straight back into logistics themes.
    expect(correction).not.toMatch(/delivery|refund|app stability|customer support/i);
  });
});
