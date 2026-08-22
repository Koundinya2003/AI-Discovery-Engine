// Forum / community collector — search-then-fetch pattern.
//
// COMPLIANCE: none of the configured domains offer an official, free API for
// this use case, and directly scraping any single forum is fragile and
// ToS-risky. Instead we run a web search scoped to a small, configurable
// allowlist of community domains, fetch only the pages that search already
// surfaced as public results, and extract the main text. Volume is capped
// (FORUM_MAX_ITEMS, default 120) per run. Reddit is deliberately excluded —
// see README.
//
// The search step is provider-swappable via SEARCH_PROVIDER so this keeps
// working with whichever free/cheap search API you actually sign up for:
//   - "google_cse": Google Custom Search JSON API (100 free queries/day)
//   - "bing":       Bing Web Search API
//   - "serpapi":    SerpAPI

import * as cheerio from "cheerio";
import type { CollectedItem, SourceStat } from "@/lib/types";
import { fetchWithTimeout } from "@/lib/http";

const DEFAULT_DOMAINS = ["onlytechforum.in", "pissedconsumer.com", "quora.com"];
const MAX_ITEMS = Number(process.env.FORUM_MAX_ITEMS ?? 120);
const RESULTS_PER_DOMAIN = 8;
const FETCH_TIMEOUT_MS = 8000;

function getDomains(): string[] {
  const raw = process.env.FORUM_DOMAINS;
  if (!raw) return DEFAULT_DOMAINS;
  return raw
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
}

type SearchHit = { url: string; title: string };

async function searchGoogleCse(query: string, site: string): Promise<SearchHit[]> {
  const key = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  if (!key || !cx) throw new Error("GOOGLE_CSE_API_KEY / GOOGLE_CSE_CX not configured");

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", key);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", `site:${site} ${query}`);
  url.searchParams.set("num", String(RESULTS_PER_DOMAIN));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Google CSE failed: ${res.status}`);
  const data = await res.json();
  return (data.items ?? []).map((i: { link: string; title: string }) => ({ url: i.link, title: i.title }));
}

async function searchBing(query: string, site: string): Promise<SearchHit[]> {
  const key = process.env.BING_SEARCH_API_KEY;
  if (!key) throw new Error("BING_SEARCH_API_KEY not configured");

  const url = new URL("https://api.bing.microsoft.com/v7.0/search");
  url.searchParams.set("q", `site:${site} ${query}`);
  url.searchParams.set("count", String(RESULTS_PER_DOMAIN));

  const res = await fetch(url.toString(), { headers: { "Ocp-Apim-Subscription-Key": key } });
  if (!res.ok) throw new Error(`Bing search failed: ${res.status}`);
  const data = await res.json();
  return (data.webPages?.value ?? []).map((i: { url: string; name: string }) => ({ url: i.url, title: i.name }));
}

async function searchSerpApi(query: string, site: string): Promise<SearchHit[]> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) throw new Error("SERPAPI_API_KEY not configured");

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("q", `site:${site} ${query}`);
  url.searchParams.set("num", String(RESULTS_PER_DOMAIN));
  url.searchParams.set("api_key", key);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`SerpAPI failed: ${res.status}`);
  const data = await res.json();
  return (data.organic_results ?? []).map((i: { link: string; title: string }) => ({ url: i.link, title: i.title }));
}

async function searchSite(query: string, site: string): Promise<SearchHit[]> {
  const provider = process.env.SEARCH_PROVIDER ?? "google_cse";
  switch (provider) {
    case "google_cse":
      return searchGoogleCse(query, site);
    case "bing":
      return searchBing(query, site);
    case "serpapi":
      return searchSerpApi(query, site);
    default:
      throw new Error(`Unknown SEARCH_PROVIDER: ${provider}`);
  }
}

function domainLabel(domain: string): string {
  // "onlytechforum.in" -> "onlytech_forum", "pissedconsumer.com" -> "pissedconsumer"
  const base = domain.split(".")[0];
  return base.replace(/forum$/i, "_forum").toLowerCase();
}

async function fetchMainText(url: string): Promise<string> {
  try {
    const res = await fetchWithTimeout(
      url,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; DiscoveryEngineBot/1.0)" } },
      FETCH_TIMEOUT_MS
    );
    if (!res.ok) return "";
    const html = await res.text();
    const $ = cheerio.load(html);
    $("script, style, nav, footer, header, noscript").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim();
    return text.slice(0, 4000); // cap per-page text to keep the item set token-friendly
  } catch {
    return "";
  }
}

export async function collectForums(
  productName: string
): Promise<{ items: CollectedItem[]; perDomainStats: SourceStat[] }> {
  const domains = getDomains();
  const query = `${productName} review complaint experience`;

  const items: CollectedItem[] = [];
  const perDomainStats: SourceStat[] = [];

  for (const domain of domains) {
    const label = domainLabel(domain);
    try {
      const hits = await searchSite(query, domain);
      let domainCount = 0;

      const pages = await Promise.allSettled(
        hits.map(async (hit) => ({ hit, text: await fetchMainText(hit.url) }))
      );

      for (const p of pages) {
        if (items.length >= MAX_ITEMS) break;
        if (p.status !== "fulfilled") continue;
        const { hit, text } = p.value;
        if (!text || text.length < 100) continue;
        items.push({
          id: `forum_${label}_${Buffer.from(hit.url).toString("base64url").slice(0, 24)}`,
          source: "forum",
          sourceLabel: label,
          text,
          url: hit.url,
        });
        domainCount++;
      }

      perDomainStats.push({ source: "forum", label, count: domainCount });
    } catch (err) {
      perDomainStats.push({
        source: "forum",
        label,
        count: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (items.length >= MAX_ITEMS) break;
  }

  return { items: items.slice(0, MAX_ITEMS), perDomainStats };
}
