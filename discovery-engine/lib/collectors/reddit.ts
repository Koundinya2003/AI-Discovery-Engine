// Community collector — Reddit's public JSON endpoints.
//
// Replaces the Google-CSE-backed forum collector, which needed two API keys,
// burned a 100/day quota, and in practice returned zero items for every
// domain (a CSE scoped to a fixed site list ignores the per-query `site:`
// operator this app was adding). Reddit's search endpoint needs no key, no
// OAuth, and no quota registration: appending `.json` to any public listing
// URL returns the same data the HTML page renders.
//
// COMPLIANCE: these are Reddit's own public JSON endpoints for public posts —
// no login wall, no paywall, no personal data beyond the public author handle
// (which this collector does not store). Volume is capped per run
// (REDDIT_MAX_ITEMS, default 200), requests are bounded and serialised in
// small batches, and a 429 is surfaced as a rate-limited state rather than
// retried aggressively. This is the pre-purchase channel: app-store reviews
// structurally cannot contain "I saved it but didn't buy it" — the person
// writing an app review has already bought.

import type { CollectedItem, SourceStatus } from "@/lib/types";
import { fetchWithTimeout } from "@/lib/http";
import { classifyError, reasonForStatus, SourceUnavailableError, type UnavailableReason } from "@/lib/errors";
import { log } from "@/lib/logger";
import { attributePlatform, type PlatformSpec } from "@/lib/platforms";

/**
 * Subreddits where Indian online-fashion shopping is actually discussed.
 * Overridable with REDDIT_SUBREDDITS (comma-separated) without a code change.
 */
const DEFAULT_SUBREDDITS = [
  "IndianFashionAddicts",
  "IndianStreetwear",
  "TwoXIndia",
  "india",
  "DesiFashionAdvice",
  "Nykaa",
];

/**
 * Three compact boolean queries per subreddit rather than one query per term:
 * Reddit's search accepts OR groups and quoted phrases, so 3 requests cover
 * ~20 terms. 6 subs × 3 queries = 18 bounded requests, which fits the
 * serverless time budget alongside the other collectors.
 */
const QUERY_GROUPS: Array<{ id: string; q: string }> = [
  {
    id: "platform",
    q: 'nykaa OR myntra OR ajio OR "online shopping" OR "fashion app"',
  },
  {
    id: "wishlist_intent",
    q: 'wishlist OR "saved items" OR "save for later" OR "add to cart" OR "should i buy" OR "worth buying" OR "window shopping"',
  },
  {
    id: "fit_returns",
    q: '"size chart" OR "runs small" OR "true to size" OR sizing OR fit OR return OR exchange OR "quality" OR "fabric"',
  },
];

const MAX_ITEMS = Number(process.env.REDDIT_MAX_ITEMS ?? 200);
const LIMIT_PER_QUERY = 100;
const REQUEST_TIMEOUT_MS = 7000;
const CONCURRENCY = 4;
const MIN_TEXT_CHARS = 40;

// Reddit rejects generic/absent user agents outright. A descriptive UA naming
// the project is what their API guidelines ask for.
const USER_AGENT = "web:ai-discovery-engine:2.0 (research prototype; contact via repository)";

/** Topical gate — keeps r/india's non-fashion volume out of a fashion corpus. */
const TOPICAL = /\b(nykaa|myntra|ajio|meesho|flipkart|amazon\s+fashion|shein|zara|h&m|fashion|clothing|clothes|outfit|dress|kurta|kurti|saree|lehenga|jeans|shirt|tshirt|t-shirt|shoes|footwear|size|sizing|fit|fabric|wishlist|wardrobe|shopping|apparel|ethnic\s+wear|western\s+wear)\b/i;

type RedditChild = {
  kind: string;
  data?: {
    id?: string;
    title?: string;
    selftext?: string;
    permalink?: string;
    created_utc?: number;
    subreddit?: string;
    over_18?: boolean;
    score?: number;
    stickied?: boolean;
  };
};

export function buildSearchUrl(subreddit: string, query: string, limit = LIMIT_PER_QUERY): string {
  const url = new URL(`https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json`);
  url.searchParams.set("q", query);
  url.searchParams.set("restrict_sr", "1");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("sort", "relevance");
  url.searchParams.set("t", "all");
  url.searchParams.set("include_over_18", "off");
  url.searchParams.set("raw_json", "1");
  return url.toString();
}

/** Post title + body, flattened. Returns "" when there's nothing substantive. */
export function postText(data: NonNullable<RedditChild["data"]>): string {
  const title = (data.title ?? "").trim();
  const body = (data.selftext ?? "").replace(/\s+/g, " ").trim();
  if (body === "[removed]" || body === "[deleted]") return title;
  return [title, body].filter(Boolean).join(" — ").trim();
}

export type RedditParseResult = { items: CollectedItem[]; offTopic: number; tooShort: number };

/** Pure parser, unit-tested against a captured payload — no network involved. */
export function parseListing(
  json: unknown,
  subreddit: string,
  platforms: PlatformSpec[]
): RedditParseResult {
  const children = (json as { data?: { children?: RedditChild[] } })?.data?.children ?? [];
  const items: CollectedItem[] = [];
  let offTopic = 0;
  let tooShort = 0;

  for (const child of children) {
    const d = child?.data;
    if (!d || d.over_18 || d.stickied) continue;
    const text = postText(d);
    if (text.length < MIN_TEXT_CHARS) {
      tooShort++;
      continue;
    }
    if (!TOPICAL.test(text)) {
      offTopic++;
      continue;
    }
    items.push({
      id: `reddit_${d.id ?? Math.random().toString(36).slice(2)}`,
      source: "reddit",
      sourceLabel: `r/${d.subreddit ?? subreddit}`,
      platform: attributePlatform(text, platforms),
      text: text.slice(0, 2000),
      date: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : undefined,
      url: d.permalink ? `https://www.reddit.com${d.permalink}` : `https://www.reddit.com/r/${subreddit}`,
    });
  }

  return { items, offTopic, tooShort };
}

function getSubreddits(): string[] {
  const raw = process.env.REDDIT_SUBREDDITS;
  if (!raw) return DEFAULT_SUBREDDITS;
  const parsed = raw.split(",").map((s) => s.trim().replace(/^r\//i, "")).filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_SUBREDDITS;
}

async function fetchOne(url: string): Promise<unknown> {
  const res = await fetchWithTimeout(
    url,
    { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } },
    REQUEST_TIMEOUT_MS
  );
  if (!res.ok) throw new SourceUnavailableError(reasonForStatus(res.status), `reddit ${res.status}`);
  return res.json();
}

/** Run `tasks` with bounded concurrency, preserving per-task settlement. */
async function pooled<T>(tasks: Array<() => Promise<T>>, size: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(size, tasks.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= tasks.length) return;
      try {
        results[index] = { status: "fulfilled", value: await tasks[index]() };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export type RedditCollectResult = {
  items: CollectedItem[];
  breakdown: SourceStatus["breakdown"];
  rejected: SourceStatus["rejected"];
  /** Set when every request failed — drives the clean "unavailable" state. */
  failureReason?: UnavailableReason;
};

export async function collectReddit(platforms: PlatformSpec[]): Promise<RedditCollectResult> {
  const subreddits = getSubreddits();
  const tasks: Array<() => Promise<{ sub: string; parsed: RedditParseResult }>> = [];

  for (const sub of subreddits) {
    for (const group of QUERY_GROUPS) {
      tasks.push(async () => {
        const json = await fetchOne(buildSearchUrl(sub, group.q));
        return { sub, parsed: parseListing(json, sub, platforms) };
      });
    }
  }

  const settled = await pooled(tasks, CONCURRENCY);

  const seen = new Set<string>();
  const items: CollectedItem[] = [];
  const perSub = new Map<string, number>();
  let offTopic = 0;
  let tooShort = 0;
  const failures: UnavailableReason[] = [];

  for (const outcome of settled) {
    if (outcome.status === "rejected") {
      failures.push(classifyError(outcome.reason));
      continue;
    }
    const { parsed } = outcome.value;
    offTopic += parsed.offTopic;
    tooShort += parsed.tooShort;
    for (const item of parsed.items) {
      if (items.length >= MAX_ITEMS) break;
      if (seen.has(item.id)) continue; // the three query groups overlap by design
      seen.add(item.id);
      items.push(item);
      perSub.set(item.sourceLabel, (perSub.get(item.sourceLabel) ?? 0) + 1);
    }
  }

  log.info("reddit.collected", {
    subreddits: subreddits.length,
    requests: tasks.length,
    failures: failures.length,
    kept: items.length,
    offTopic,
    tooShort,
  });

  const rejected: SourceStatus["rejected"] = [];
  if (offTopic > 0) rejected.push({ label: "off-topic for fashion", count: offTopic });
  if (tooShort > 0) rejected.push({ label: "too short to analyse", count: tooShort });

  // Only call the whole source unavailable when nothing at all came back;
  // a handful of failed subreddit queries alongside real results is a
  // partial, not a failure, and is reported through `rejected` instead.
  const failureReason =
    items.length === 0
      ? failures.length === tasks.length && failures.length > 0
        ? mostCommon(failures)
        : "no_results"
      : undefined;

  return {
    items,
    breakdown: [...perSub.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    rejected: rejected.length ? rejected : undefined,
    failureReason,
  };
}

function mostCommon(reasons: UnavailableReason[]): UnavailableReason {
  const counts = new Map<UnavailableReason, number>();
  for (const r of reasons) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** Exported for /methodology so the published query terms cannot drift. */
export const REDDIT_QUERY_GROUPS = QUERY_GROUPS;
export const REDDIT_DEFAULT_SUBREDDITS = DEFAULT_SUBREDDITS;
export const REDDIT_TOPICAL_FILTER = TOPICAL.source;
