import { describe, expect, it } from "vitest";
import { SourceUnavailableError, classifyError, reasonCopy, reasonForStatus, scrubForDisplay } from "./errors";

describe("classifyError", () => {
  it("passes a declared reason straight through", () => {
    expect(classifyError(new SourceUnavailableError("rate_limited", "reddit 429"))).toBe("rate_limited");
  });

  it("maps status codes to categories", () => {
    expect(classifyError(new Error("reddit 403"))).toBe("blocked");
    expect(classifyError(new Error("HTTP 429 too many requests"))).toBe("rate_limited");
  });

  it("maps network and timeout shapes", () => {
    expect(classifyError(new Error("The operation was aborted"))).toBe("timeout");
    expect(classifyError(new Error("fetch failed"))).toBe("network");
    expect(classifyError(new Error("getaddrinfo ENOTFOUND api.example.test"))).toBe("network");
  });

  it("falls back to a generic upstream category", () => {
    expect(classifyError(new Error("something odd happened"))).toBe("upstream_error");
    expect(classifyError("a bare string")).toBe("upstream_error");
  });
});

describe("reasonCopy", () => {
  it("returns user-facing copy for every reason, naming no configuration", () => {
    const reasons = [
      "not_configured",
      "no_results",
      "blocked",
      "rate_limited",
      "timeout",
      "network",
      "upstream_error",
      "no_confident_match",
    ] as const;

    for (const reason of reasons) {
      const copy = reasonCopy(reason);
      expect(copy.headline.length).toBeGreaterThan(0);
      expect(copy.detail.length).toBeGreaterThan(0);
      // No environment variable name may appear in anything user-facing.
      expect(`${copy.headline} ${copy.detail}`).not.toMatch(/[A-Z][A-Z0-9]*(_[A-Z0-9]+)+/);
      expect(`${copy.headline} ${copy.detail}`).not.toMatch(/API_KEY|GOOGLE_CSE|GROQ|YOUTUBE|UPSTASH/i);
    }
  });
});

describe("scrubForDisplay", () => {
  it("redacts env-var-shaped tokens", () => {
    expect(scrubForDisplay("GOOGLE_CSE_API_KEY / GOOGLE_CSE_CX not configured")).toBe(
      "[redacted] / [redacted] not configured"
    );
  });

  it("redacts urls, which can carry keys in a query string", () => {
    expect(scrubForDisplay("failed calling https://api.example.test/v1?key=abc123")).toBe("failed calling [url]");
  });

  it("redacts long opaque tokens", () => {
    expect(scrubForDisplay("token gsk_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345 rejected")).toBe("token [redacted] rejected");
  });

  it("leaves ordinary prose alone", () => {
    expect(scrubForDisplay("The source refused automated access for this request.")).toBe(
      "The source refused automated access for this request."
    );
  });
});

describe("reasonForStatus", () => {
  it("categorises the statuses collectors actually see", () => {
    expect(reasonForStatus(401)).toBe("blocked");
    expect(reasonForStatus(403)).toBe("blocked");
    expect(reasonForStatus(429)).toBe("rate_limited");
    expect(reasonForStatus(404)).toBe("no_results");
    expect(reasonForStatus(500)).toBe("upstream_error");
    expect(reasonForStatus(418)).toBe("upstream_error");
  });
});
