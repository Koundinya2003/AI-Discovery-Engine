import { describe, expect, it } from "vitest";
import { buildSearchUrl, parseListing, postText, REDDIT_QUERY_GROUPS, REDDIT_DEFAULT_SUBREDDITS } from "./reddit";
import { resolvePlatform } from "@/lib/platforms";

const PLATFORMS = [resolvePlatform("Nykaa Fashion"), resolvePlatform("Myntra"), resolvePlatform("AJIO")];

function child(data: Record<string, unknown>) {
  return { kind: "t3", data: { id: "abc", subreddit: "IndianFashionAddicts", permalink: "/r/x/comments/abc/", ...data } };
}

describe("buildSearchUrl", () => {
  it("hits the public per-subreddit search endpoint with restrict_sr", () => {
    const url = new URL(buildSearchUrl("IndianFashionAddicts", "size chart", 100));
    expect(url.origin + url.pathname).toBe("https://www.reddit.com/r/IndianFashionAddicts/search.json");
    expect(url.searchParams.get("restrict_sr")).toBe("1");
    expect(url.searchParams.get("q")).toBe("size chart");
    expect(url.searchParams.get("limit")).toBe("100");
  });

  it("encodes a subreddit name safely", () => {
    expect(buildSearchUrl("Two X India", "q")).toContain("/r/Two%20X%20India/search.json");
  });

  it("carries no credential of any kind", () => {
    const url = buildSearchUrl("india", "wishlist");
    expect(url).not.toMatch(/key|token|auth|secret/i);
  });
});

describe("query configuration", () => {
  it("covers the brief's search terms", () => {
    const all = REDDIT_QUERY_GROUPS.map((g) => g.q).join(" ").toLowerCase();
    for (const term of ["wishlist", "size chart", "runs small", "should i buy", "return", "fit", "nykaa", "myntra", "ajio"]) {
      expect(all).toContain(term);
    }
  });

  it("searches the named communities", () => {
    for (const sub of ["IndianFashionAddicts", "IndianStreetwear", "TwoXIndia", "india", "DesiFashionAdvice", "Nykaa"]) {
      expect(REDDIT_DEFAULT_SUBREDDITS).toContain(sub);
    }
  });
});

describe("postText", () => {
  it("joins title and body", () => {
    expect(postText({ title: "T", selftext: "B" })).toBe("T — B");
  });

  it("drops a removed body but keeps the title", () => {
    expect(postText({ title: "T", selftext: "[removed]" })).toBe("T");
  });

  it("survives a missing body", () => {
    expect(postText({ title: "T" })).toBe("T");
  });
});

describe("parseListing", () => {
  it("keeps topical posts and attributes them to the platform they name", () => {
    const json = {
      data: {
        children: [
          child({ id: "1", title: "Myntra sizing is a mess", selftext: "Every brand runs different, the size chart lies" }),
        ],
      },
    };
    const { items } = parseListing(json, "IndianFashionAddicts", PLATFORMS);
    expect(items).toHaveLength(1);
    expect(items[0].platform).toBe("Myntra");
    expect(items[0].source).toBe("reddit");
    expect(items[0].sourceLabel).toBe("r/IndianFashionAddicts");
    expect(items[0].url).toBe("https://www.reddit.com/r/x/comments/abc/");
  });

  it("marks a post naming two platforms as cross-platform, not evidence about one", () => {
    const json = {
      data: {
        children: [
          child({ id: "2", title: "Myntra vs AJIO for kurtas", selftext: "Which has better fabric quality and sizing?" }),
        ],
      },
    };
    const { items } = parseListing(json, "india", PLATFORMS);
    expect(items[0].platform).toBe("Cross-platform");
  });

  it("counts off-topic posts instead of dropping them silently", () => {
    const json = {
      data: {
        children: [
          child({ id: "3", title: "Best mutual funds for 2026", selftext: "Looking for long term SIP advice please" }),
        ],
      },
    };
    const { items, offTopic } = parseListing(json, "india", PLATFORMS);
    expect(items).toHaveLength(0);
    expect(offTopic).toBe(1);
  });

  it("counts too-short posts separately from off-topic ones", () => {
    const json = { data: { children: [child({ id: "4", title: "sizing?", selftext: "" })] } };
    const { items, tooShort, offTopic } = parseListing(json, "india", PLATFORMS);
    expect(items).toHaveLength(0);
    expect(tooShort).toBe(1);
    expect(offTopic).toBe(0);
  });

  it("skips NSFW and stickied posts", () => {
    const json = {
      data: {
        children: [
          child({ id: "5", title: "Myntra fashion sizing thread", selftext: "long enough text about fit and size", over_18: true }),
          child({ id: "6", title: "Myntra fashion sizing thread", selftext: "long enough text about fit and size", stickied: true }),
        ],
      },
    };
    expect(parseListing(json, "india", PLATFORMS).items).toHaveLength(0);
  });

  it("converts created_utc to an ISO date", () => {
    const json = {
      data: {
        children: [
          child({
            id: "7",
            title: "Nykaa Fashion size chart question",
            selftext: "Does this brand run small or true to size?",
            created_utc: 1_700_000_000,
          }),
        ],
      },
    };
    expect(parseListing(json, "Nykaa", PLATFORMS).items[0].date).toBe(new Date(1_700_000_000 * 1000).toISOString());
  });

  it("returns empty results for a malformed payload rather than throwing", () => {
    expect(parseListing({}, "india", PLATFORMS).items).toEqual([]);
    expect(parseListing(null, "india", PLATFORMS).items).toEqual([]);
    expect(parseListing({ data: { children: [{ kind: "t3" }] } }, "india", PLATFORMS).items).toEqual([]);
  });
});
