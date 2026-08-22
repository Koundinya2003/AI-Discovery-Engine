import { NextRequest, NextResponse } from "next/server";
import type { CollectedItem, DiscoverRequest, DiscoverResponse, SourceKind, SourceStat, ThemeResult } from "@/lib/types";
import { collectAppStore } from "@/lib/collectors/app_store";
import { collectPlayStore } from "@/lib/collectors/play_store";
import { collectYouTube } from "@/lib/collectors/youtube";
import { collectForums } from "@/lib/collectors/forums";
import { discoverThemes } from "@/lib/groq/themes";
import { classifyItems } from "@/lib/groq/classify";
import { checkRateLimit, buildDiscoverCacheKey, getCachedDiscoverResult, setCachedDiscoverResult } from "@/lib/redis";
import { log } from "@/lib/logger";

// Vercel Hobby allows up to 60s for a Node.js serverless function with this
// declared. A full run (4 parallel collectors + 1 theme-discovery Groq call +
// ~10 batched classification Groq calls, each spaced ~2.1s apart to respect
// Groq's free-tier 30 req/min limit) is tuned to fit comfortably inside that.
export const maxDuration = 60;

const SOURCES: SourceKind[] = ["app_store", "play_store", "youtube", "forum"];
const MAX_PRODUCT_NAME_LENGTH = 200;

function clientIdentifier(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  let body: DiscoverRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const productName = body.productName?.trim();
  if (!productName) {
    return NextResponse.json({ error: "productName is required" }, { status: 400 });
  }
  if (productName.length > MAX_PRODUCT_NAME_LENGTH) {
    return NextResponse.json({ error: `productName must be ${MAX_PRODUCT_NAME_LENGTH} characters or fewer` }, { status: 400 });
  }

  const identifier = clientIdentifier(req);
  const rateLimit = await checkRateLimit("discover", identifier);
  if (rateLimit.limited) {
    log.info("discover.rate_limited", { identifier, retryAfterSeconds: rateLimit.retryAfterSeconds });
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) } }
    );
  }

  const cacheKey = buildDiscoverCacheKey(productName, body.appStoreId, body.playPackage);
  const cached = await getCachedDiscoverResult(cacheKey);
  if (cached) {
    log.info("discover.cache_hit", { productName, cacheKey });
    return NextResponse.json({ ...cached, cached: true });
  }

  log.info("discover.start", { productName, identifier });

  const youtubeConfigured = Boolean(process.env.YOUTUBE_API_KEY);
  const forumConfigured = Boolean(process.env.SEARCH_PROVIDER || process.env.GOOGLE_CSE_API_KEY);

  const [appStoreResult, playStoreResult, youtubeResult, forumsResult] = await Promise.allSettled([
    collectAppStore(productName, body.appStoreId),
    collectPlayStore(productName, body.playPackage),
    youtubeConfigured ? collectYouTube(productName) : Promise.resolve({ items: [] as CollectedItem[] }),
    forumConfigured
      ? collectForums(productName)
      : Promise.resolve({ items: [] as CollectedItem[], perDomainStats: [] as SourceStat[] }),
  ]);

  const items: CollectedItem[] = [];
  const stats: SourceStat[] = [];
  const warnings: string[] = [];

  let resolvedAppStoreTitle: string | undefined;
  let resolvedPlayStoreTitle: string | undefined;

  if (appStoreResult.status === "fulfilled") {
    items.push(...appStoreResult.value.items);
    resolvedAppStoreTitle = appStoreResult.value.resolvedTitle;
    stats.push({ source: "app_store", label: "App Store", count: appStoreResult.value.items.length });
  } else {
    stats.push({ source: "app_store", label: "App Store", count: 0, error: String(appStoreResult.reason) });
    warnings.push(`App Store collection failed: ${appStoreResult.reason}`);
  }

  if (playStoreResult.status === "fulfilled") {
    items.push(...playStoreResult.value.items);
    resolvedPlayStoreTitle = playStoreResult.value.resolvedTitle;
    stats.push({ source: "play_store", label: "Play Store", count: playStoreResult.value.items.length });
  } else {
    stats.push({ source: "play_store", label: "Play Store", count: 0, error: String(playStoreResult.reason) });
    warnings.push(`Play Store collection failed: ${playStoreResult.reason}`);
  }

  if (youtubeResult.status === "fulfilled") {
    items.push(...youtubeResult.value.items);
    stats.push({ source: "youtube", label: "YouTube", count: youtubeResult.value.items.length });
  } else {
    stats.push({ source: "youtube", label: "YouTube", count: 0, error: String(youtubeResult.reason) });
    warnings.push(`YouTube collection failed: ${youtubeResult.reason}`);
  }

  if (forumsResult.status === "fulfilled") {
    items.push(...forumsResult.value.items);
    stats.push({ source: "forum", label: "Forums", count: forumsResult.value.items.length });
  } else {
    stats.push({ source: "forum", label: "Forums", count: 0, error: String(forumsResult.reason) });
    warnings.push(`Forum collection failed: ${forumsResult.reason}`);
  }

  const NOT_CONFIGURED: Partial<Record<SourceKind, string>> = {
    youtube: youtubeConfigured ? undefined : "YOUTUBE_API_KEY not configured",
    forum: forumConfigured ? undefined : "SEARCH_PROVIDER/GOOGLE_CSE_API_KEY not configured",
  };

  for (const s of SOURCES) {
    const stat = stats.find((x) => x.source === s);
    if (!stat || stat.count > 0 || stat.error) continue;
    const skipReason = NOT_CONFIGURED[s];
    warnings.push(skipReason ? `${stat.label} skipped: ${skipReason}.` : `${stat.label} returned zero items.`);
  }

  log.info("discover.collected", {
    productName,
    itemsScraped: items.length,
    stats: stats.map((s) => ({ source: s.source, count: s.count, error: s.error })),
    durationMs: Date.now() - startedAt,
  });

  if (items.length === 0) {
    log.error("discover.no_items", { productName, warnings });
    return NextResponse.json(
      { error: "No items were collected from any source. See warnings for details.", warnings },
      { status: 502 }
    );
  }

  let themes;
  try {
    themes = await discoverThemes(productName, items);
  } catch (err) {
    log.error("discover.theme_discovery_failed", { productName, error: String(err) });
    return NextResponse.json(
      { error: `Theme discovery failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }

  const { tags, workingSet } = await classifyItems(items, themes);
  const tagByItemId = new Map(tags.map((t) => [t.itemId, t]));

  const corpus: DiscoverResponse["corpus"] = workingSet.map((item) => {
    const tag = tagByItemId.get(item.id);
    return { ...item, themeCode: tag?.themeCode ?? "OTH", sentiment: tag?.sentiment ?? "neutral" };
  });

  const themeResults = aggregateThemes(themes, corpus);

  const response: DiscoverResponse = {
    productName,
    stats,
    totals: { scraped: items.length, classified: corpus.length },
    resolvedAppStoreTitle,
    resolvedPlayStoreTitle,
    themes: themeResults,
    corpus,
    warnings,
  };

  await setCachedDiscoverResult(cacheKey, response);

  log.info("discover.complete", {
    productName,
    itemsScraped: items.length,
    itemsClassified: corpus.length,
    themeCount: themeResults.length,
    durationMs: Date.now() - startedAt,
  });

  return NextResponse.json(response);
}

function aggregateThemes(
  themes: { code: string; title: string; definition: string }[],
  corpus: DiscoverResponse["corpus"]
): ThemeResult[] {
  const byTheme = new Map<string, DiscoverResponse["corpus"]>();
  for (const item of corpus) {
    const arr = byTheme.get(item.themeCode) ?? [];
    arr.push(item);
    byTheme.set(item.themeCode, arr);
  }

  const results: ThemeResult[] = themes.map((theme) => {
    const themeItems = byTheme.get(theme.code) ?? [];
    return {
      code: theme.code,
      title: theme.title,
      definition: theme.definition,
      count: themeItems.length,
      relativeFrequency: 0, // filled in below
      quotes: pickDiverseQuotes(themeItems, 3),
    };
  });

  const maxCount = Math.max(1, ...results.map((r) => r.count));
  for (const r of results) r.relativeFrequency = r.count / maxCount;

  return results.filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
}

function pickDiverseQuotes(items: DiscoverResponse["corpus"], max: number): ThemeResult["quotes"] {
  const bySource = new Map<string, DiscoverResponse["corpus"]>();
  for (const item of items) {
    const arr = bySource.get(item.sourceLabel) ?? [];
    arr.push(item);
    bySource.set(item.sourceLabel, arr);
  }

  const quotes: ThemeResult["quotes"] = [];
  const sourceLabels = [...bySource.keys()];
  let round = 0;
  while (quotes.length < max && sourceLabels.some((s) => (bySource.get(s)?.length ?? 0) > round)) {
    for (const label of sourceLabels) {
      if (quotes.length >= max) break;
      const arr = bySource.get(label)!;
      const candidate = arr[round];
      if (candidate) {
        quotes.push({ text: candidate.text.slice(0, 400), source: candidate.source, sourceLabel: candidate.sourceLabel, url: candidate.url });
      }
    }
    round++;
  }

  return quotes;
}
