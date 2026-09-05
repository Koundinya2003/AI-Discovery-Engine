// Apple App Store collector.
//
// Fully compliant / free: only Apple's public, unauthenticated endpoints — the
// iTunes Search API (to resolve a platform name to an App Store numeric ID)
// and the public "customer reviews" RSS feed. No scraping, no ToS gray area.
//
// A resolved match is only accepted when the app's title contains one of the
// platform's expected tokens. A numeric ID that resolves to the wrong app is
// the worst failure mode this pipeline has — it produces a full corpus of
// confident, plausible, wrong data — so "no confident match" is treated as a
// clean unavailable state rather than something to paper over.

import type { CollectedItem } from "@/lib/types";
import { fetchWithTimeout, withRetry } from "@/lib/http";
import { SourceUnavailableError, reasonForStatus } from "@/lib/errors";
import type { PlatformSpec } from "@/lib/platforms";

const COUNTRY = "in";
const MAX_PAGES = 6; // RSS pages (~50 reviews each) -> up to ~300 reviews

type ITunesSearchResult = { trackId: number; trackName: string };

export function titleMatches(title: string, mustMatch: string[]): boolean {
  const lower = title.toLowerCase();
  return mustMatch.some((token) => lower.includes(token.toLowerCase()));
}

export async function resolveAppStoreId(platform: PlatformSpec): Promise<{ id: string; title: string }> {
  if (platform.appStoreId) {
    return { id: platform.appStoreId, title: `${platform.label} (id supplied)` };
  }

  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", platform.label);
  url.searchParams.set("country", COUNTRY);
  url.searchParams.set("entity", "software");
  url.searchParams.set("limit", "10");

  const res = await withRetry(() => fetchWithTimeout(url.toString(), { headers: { Accept: "application/json" } }));
  if (!res.ok) throw new SourceUnavailableError(reasonForStatus(res.status), `itunes search ${res.status}`);
  const data = (await res.json()) as { results?: ITunesSearchResult[] };
  const results = data.results ?? [];
  if (results.length === 0) throw new SourceUnavailableError("no_results", "itunes search empty");

  const match = results.find((r) => titleMatches(r.trackName, platform.titleMustMatch));
  if (!match) throw new SourceUnavailableError("no_confident_match", `top hit ${results[0]?.trackName}`);

  return { id: String(match.trackId), title: match.trackName };
}

type RssFeedEntry = {
  id?: { label?: string };
  "im:rating"?: { label?: string };
  title?: { label?: string };
  content?: { label?: string };
  updated?: { label?: string };
};

async function fetchReviewPage(appStoreId: string, page: number): Promise<RssFeedEntry[]> {
  const url = `https://itunes.apple.com/${COUNTRY}/rss/customerreviews/page=${page}/id=${appStoreId}/sortBy=mostRecent/json`;
  const res = await withRetry(() => fetchWithTimeout(url, { headers: { Accept: "application/json" } }));
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new SourceUnavailableError(reasonForStatus(res.status), `app store rss ${res.status}`);
  }
  const data = (await res.json()) as { feed?: { entry?: RssFeedEntry[] | RssFeedEntry } };
  const entry = data.feed?.entry;
  if (!entry) return [];
  const entries = Array.isArray(entry) ? entry : [entry];
  // The first "entry" in Apple's feed is app metadata (no im:rating) — skip it.
  return entries.filter((e) => e["im:rating"] !== undefined);
}

export async function collectAppStore(
  platform: PlatformSpec
): Promise<{ items: CollectedItem[]; resolvedTitle: string }> {
  const resolved = await resolveAppStoreId(platform);

  const items: CollectedItem[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const entries = await fetchReviewPage(resolved.id, page);
    if (entries.length === 0) break;

    for (const e of entries) {
      const text = [e.title?.label, e.content?.label].filter(Boolean).join(" — ");
      if (!text.trim()) continue;
      items.push({
        id: `app_store_${platform.key}_${e.id?.label ?? `${page}_${items.length}`}`,
        source: "app_store",
        sourceLabel: "app_store",
        platform: platform.label,
        text,
        rating: e["im:rating"]?.label ? Number(e["im:rating"].label) : undefined,
        date: e.updated?.label,
        url: `https://apps.apple.com/${COUNTRY}/app/id${resolved.id}`,
      });
    }
  }

  return { items, resolvedTitle: resolved.title };
}
