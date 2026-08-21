// Apple App Store collector.
//
// Fully compliant / free: uses only Apple's public, unauthenticated endpoints —
// the iTunes Search API (to resolve a product name to an App Store numeric ID)
// and the public "customer reviews" RSS feed (to fetch reviews). No scraping,
// no ToS gray area.

import type { CollectedItem } from "@/lib/types";

const COUNTRY = "in";
const MAX_PAGES = 5; // RSS feed pages (~50 reviews/page) -> up to ~250 reviews

type ITunesSearchResult = {
  trackId: number;
  trackName: string;
};

export async function resolveAppStoreId(productName: string): Promise<{ id: string; title: string } | null> {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", productName);
  url.searchParams.set("country", COUNTRY);
  url.searchParams.set("entity", "software");
  url.searchParams.set("limit", "5");

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`iTunes search failed: ${res.status}`);
  const data = (await res.json()) as { results: ITunesSearchResult[] };
  if (!data.results?.length) return null;

  const top = data.results[0];
  return { id: String(top.trackId), title: top.trackName };
}

type RssFeedEntry = {
  id?: { label?: string };
  author?: { name?: { label?: string } };
  "im:rating"?: { label?: string };
  title?: { label?: string };
  content?: { label?: string };
  updated?: { label?: string };
};

async function fetchReviewPage(appStoreId: string, page: number): Promise<RssFeedEntry[]> {
  const url = `https://itunes.apple.com/${COUNTRY}/rss/customerreviews/page=${page}/id=${appStoreId}/sortBy=mostRecent/json`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`App Store RSS failed: ${res.status}`);
  }
  const data = (await res.json()) as { feed?: { entry?: RssFeedEntry[] | RssFeedEntry } };
  const entry = data.feed?.entry;
  if (!entry) return [];
  const entries = Array.isArray(entry) ? entry : [entry];
  // The first "entry" in Apple's feed is actually the app metadata (no im:rating), skip it.
  return entries.filter((e) => e["im:rating"] !== undefined);
}

export async function collectAppStore(
  productName: string,
  appStoreId?: string
): Promise<{ items: CollectedItem[]; resolvedTitle?: string; resolvedId?: string }> {
  let id = appStoreId;
  let resolvedTitle: string | undefined;

  if (!id) {
    const resolved = await resolveAppStoreId(productName);
    if (!resolved) return { items: [] };
    id = resolved.id;
    resolvedTitle = resolved.title;
  }

  const items: CollectedItem[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const entries = await fetchReviewPage(id, page);
    if (entries.length === 0) break;

    for (const e of entries) {
      const text = [e.title?.label, e.content?.label].filter(Boolean).join(" — ");
      if (!text.trim()) continue;
      items.push({
        id: `app_store_${e.id?.label ?? `${page}_${items.length}`}`,
        source: "app_store",
        sourceLabel: "app_store",
        text,
        rating: e["im:rating"]?.label ? Number(e["im:rating"].label) : undefined,
        date: e.updated?.label,
        url: `https://apps.apple.com/${COUNTRY}/app/id${id}`,
      });
    }
  }

  return { items, resolvedTitle, resolvedId: id };
}
