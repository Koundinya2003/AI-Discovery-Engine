// YouTube collector — official YouTube Data API v3, free daily quota (10,000
// units/day). search.list finds review/complaint videos about the product,
// commentThreads.list pulls top-level comments off each.

import type { CollectedItem } from "@/lib/types";
import { fetchWithTimeout, withRetry } from "@/lib/http";
import { isLikelySpam } from "@/lib/spam";

const MAX_VIDEOS = 8;
const COMMENTS_PER_VIDEO = 50;

type SearchItem = { id: { videoId: string }; snippet: { title: string } };
type CommentThreadItem = {
  id: string;
  snippet: {
    topLevelComment: {
      snippet: {
        textDisplay: string;
        authorDisplayName: string;
        publishedAt: string;
        likeCount: number;
      };
    };
  };
};

async function searchVideos(productName: string, apiKey: string): Promise<SearchItem[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", `${productName} review complaint`);
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", String(MAX_VIDEOS));
  url.searchParams.set("relevanceLanguage", "en");
  url.searchParams.set("key", apiKey);

  const res = await withRetry(() => fetchWithTimeout(url.toString()));
  if (!res.ok) throw new Error(`YouTube search.list failed: ${res.status}`);
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
    // Comments can be disabled on a given video (403) — skip that video, don't fail the run.
    if (res.status === 403 || res.status === 404) return [];
    throw new Error(`YouTube commentThreads.list failed: ${res.status}`);
  }
  const data = await res.json();
  return data.items ?? [];
}

export async function collectYouTube(productName: string): Promise<{ items: CollectedItem[] }> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY is not configured");

  const videos = await searchVideos(productName, apiKey);
  const items: CollectedItem[] = [];

  const perVideo = await Promise.allSettled(
    videos.map((v) => fetchComments(v.id.videoId, apiKey).then((comments) => ({ video: v, comments })))
  );

  for (const result of perVideo) {
    if (result.status !== "fulfilled") continue;
    const { video, comments } = result.value;
    for (const c of comments) {
      const snippet = c.snippet.topLevelComment.snippet;
      if (!snippet.textDisplay?.trim()) continue;
      if (isLikelySpam(snippet.textDisplay)) continue; // ad/promo comments are common here and carry no product signal
      items.push({
        id: `youtube_${c.id}`,
        source: "youtube",
        sourceLabel: "youtube",
        text: snippet.textDisplay.replace(/<[^>]+>/g, ""),
        date: snippet.publishedAt,
        url: `https://www.youtube.com/watch?v=${video.id.videoId}&lc=${c.id}`,
      });
    }
  }

  return { items };
}
