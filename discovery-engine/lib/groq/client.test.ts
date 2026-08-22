import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractJson, callGroqJsonWithRetry, GroqRateLimitError } from "./client";

describe("extractJson", () => {
  it("strips ```json code fences", () => {
    expect(extractJson('```json\n{"a": 1}\n```')).toBe('{"a": 1}');
  });

  it("strips bare ``` fences", () => {
    expect(extractJson('```\n{"a": 1}\n```')).toBe('{"a": 1}');
  });

  it("passes plain JSON through unchanged", () => {
    expect(extractJson('{"a": 1}')).toBe('{"a": 1}');
  });
});

function mockGroqResponse(content: string) {
  return {
    ok: true,
    headers: { get: () => null },
    json: async () => ({ choices: [{ message: { content } }] }),
  };
}

describe("callGroqJsonWithRetry", () => {
  const originalKey = process.env.GROQ_API_KEY;

  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.GROQ_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it("retries exactly once when the first response is invalid JSON, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockGroqResponse("not valid json"))
      .mockResolvedValueOnce(mockGroqResponse('{"ok": true}'));
    vi.stubGlobal("fetch", fetchMock);

    const result = await callGroqJsonWithRetry([{ role: "user", content: "hi" }], (parsed) => parsed);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true });
  }, 10000);

  it("does not retry-with-correction on a 429 — that call would just also get rate-limited", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => null },
      text: async () => '{"error":{"message":"rate limited"}}',
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(callGroqJsonWithRetry([{ role: "user", content: "hi" }], (parsed) => parsed)).rejects.toThrow(
      GroqRateLimitError
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }, 10000);
});
