// YouTube collector — official YouTube Data API v3, free daily quota (10,000
// units/day). search.list finds review/haul videos per platform,
// commentThreads.list pulls top-level comments off each.
//
// Optional: with no key configured the source reports a clean "not configured"
// state and the rest of the run proceeds. The key's name never reaches the UI.

import type { CollectedItem, SourceStatus } from "@/lib/types";
import { fetchWithTimeout, withRetry } from "@/lib/http";
import { isLikelySpam } from "@/lib/spam";
import { SourceUnavailableError, classifyError, reasonForStatus, type UnavailableReason } from "@/lib/errors";
import type { PlatformSpec } from "@/lib/platforms";
import { log } from "@/lib/logger";

const MAX_VIDEOS_PER_PLATFORM = 5;
const COMMENTS_PER_VIDEO = 50;

type SearchItem = { id: { videoId: string }; snippet: { title: string } };
type CommentThreadItem = {
  id: string;
  snippet: {
    topLevelComment: {
      snippet: { textDisplay: string; publishedAt: string };
    };
  };
};

/** Query terms skew toward the pre-purchase end of the funnel on purpose. */
export function videoQuery(platformLabel: string): string {
  return `${platformLabel} haul review size fit quality`;
}

async function searchVideos(platform: PlatformSpec, apiKey: string): Promise<SearchItem[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", videoQuery(platform.label));
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", String(MAX_VIDEOS_PER_PLATFORM));
  url.searchParams.set("relevanceLanguage", "en");
  url.searchParams.set("key", apiKey);

  const res = await withRetry(() => fetchWithTimeout(url.toString()));
  if (!res.ok) throw new SourceUnavailableError(reasonForStatus(res.status), `youtube search ${res.status}`);
  const data = await res.json();
  return data.items ?? [];
}

async function fetchComments(videoId: string, apiKey: string): Promise<CommentThreadItem[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/commentThreads");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("videoId", videoId);
  url.searchParams.set("maxResults", String(COMMENTS_PER_VIDEO));
  url.searchParams.set("order", "relevance");
  url.searchParams.set("key", apiKey);

  const res = await withRetry(() => fetchWithTimeout(url.toString()));
  if (!res.ok) {
    // Comments can be disabled on a given video (403) — skip it, don't fail.
    if (res.status === 403 || res.status === 404) return [];
    throw new SourceUnavailableError(reasonForStatus(res.status), `youtube commentThreads ${res.status}`);
  }
  const data = await res.json();
  return data.items ?? [];
}

export type YouTubeCollectResult = {
  items: CollectedItem[];
  breakdown: SourceStatus["breakdown"];
  rejected: SourceStatus["rejected"];
  failureReason?: UnavailableReason;
};

export function isYouTubeConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY);
}

export async function collectYouTube(platforms: PlatformSpec[]): Promise<YouTubeCollectResult> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return { items: [], breakdown: [], rejected: undefined, failureReason: "not_configured" };

  const items: CollectedItem[] = [];
  const perPlatform = new Map<string, number>();
  const failures: UnavailableReason[] = [];
  let spam = 0;

  const perPlatformResults = await Promise.allSettled(
    platforms.map(async (platform) => {
      const videos = await searchVideos(platform, apiKey);
      const threads = await Promise.allSettled(
        videos.map((v) => fetchComments(v.id.videoId, apiKey).then((comments) => ({ video: v, comments })))
      );
      return { platform, threads };
    })
  );

  for (const outcome of perPlatformResults) {
    if (outcome.status === "rejected") {
      failures.push(classifyError(outcome.reason));
      continue;
    }
    const { platform, threads } = outcome.value;
    for (const t of threads) {
      if (t.status !== "fulfilled") continue;
      const { video, comments } = t.value;
      for (const c of comments) {
        const snippet = c.snippet.topLevelComment.snippet;
        const text = snippet.textDisplay?.replace(/<[^>]+>/g, "").trim();
        if (!text) continue;
        if (isLikelySpam(text)) {
          spam++;
          continue;
        }
        items.push({
          id: `youtube_${c.id}`,
          source: "youtube",
          sourceLabel: "youtube",
          platform: platform.label,
          text,
          date: snippet.publishedAt,
          url: `https://www.youtube.com/watch?v=${video.id.videoId}&lc=${c.id}`,
        });
        perPlatform.set(platform.label, (perPlatform.get(platform.label) ?? 0) + 1);
      }
    }
  }

  log.info("youtube.collected", { platforms: platforms.length, kept: items.length, spam, failures: failures.length });

  return {
    items,
    breakdown: [...perPlatform.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    rejected: spam > 0 ? [{ label: "promo/spam comments", count: spam }] : undefined,
    failureReason:
      items.length === 0 ? (failures.length > 0 ? failures[0] : "no_results") : undefined,
  };
}
