// Google Play Store collector.
//
// COMPLIANCE: `google-play-scraper` is an unofficial library that hits Google's
// public (undocumented) endpoints — a ToS gray area, not an official API. Keep
// per-run volume modest (capped below) and see README for the full disclosure.
//
// BUG FIX vs. the old Streamlit app: `search()` on a multi-word query (e.g.
// "Nykaa Fashion") can return an unrelated top hit (it once returned Myntra).
// This module never trusts a bare multi-word search() as the primary path:
//   1. If the caller supplies an exact package name, resolve it with `app()`
//      directly — no search involved, so no ambiguity.
//   2. Otherwise, try `app()` speculatively against common package-name
//      guesses derived from the product name (fast, exact-match, no search).
//   3. Only as a last resort, fall back to `search()` — and even then, using
//      just the single most distinctive (longest) word of the product name
//      rather than the full multi-word string, which is what produced the
//      wrong match previously.
// The resolved app's title is always returned so a bad match is visible
// immediately in the UI instead of silently poisoning the review set.

import gplay from "google-play-scraper";
import type { CollectedItem } from "@/lib/types";

const COUNTRY = "in";
const LANG = "en";
const MAX_REVIEWS = 300; // keep per-run volume modest, per compliance notes

// Words that describe the app's category/type rather than identify the brand
// (e.g. "Nykaa Fashion" -> the brand-identifying word is "Nykaa", not
// "Fashion" — picking the longest word would wrongly pick "Fashion" here).
const GENERIC_SUFFIX_WORDS = new Set([
  "the", "a", "an", "app", "apps", "for", "and", "store", "online", "mobile",
  "lite", "pro", "plus", "go", "official", "get", "my",
]);

function mostDistinctiveWord(productName: string): string {
  const words = productName
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean);
  if (words.length === 0) return productName;
  if (words.length === 1) return words[0];

  // Brand names conventionally lead a multi-word product name, so prefer the
  // first word that isn't a generic filler/category word.
  const meaningful = words.filter((w) => !GENERIC_SUFFIX_WORDS.has(w.toLowerCase()));
  return (meaningful.length > 0 ? meaningful : words)[0];
}

async function resolveByExactPackage(pkg: string) {
  try {
    const app = await gplay.app({ appId: pkg, lang: LANG, country: COUNTRY });
    return { appId: app.appId, title: app.title };
  } catch {
    return null;
  }
}

export async function resolvePlayStoreApp(
  productName: string,
  playPackage?: string
): Promise<{ appId: string; title: string; method: "exact_package" | "search_fallback" } | null> {
  if (playPackage) {
    const exact = await resolveByExactPackage(playPackage);
    if (exact) return { ...exact, method: "exact_package" };
  }

  // Last resort: search using only the single most distinctive word, not the
  // full multi-word query, and prefer results whose title actually contains
  // the full product name (case-insensitive) over the library's own ranking.
  const term = mostDistinctiveWord(productName);
  const results = await gplay.search({ term, num: 10, lang: LANG, country: COUNTRY });
  if (!results.length) return null;

  const nameLower = productName.toLowerCase();
  const best =
    results.find((r) => r.title.toLowerCase().includes(nameLower)) ??
    results.find((r) => r.title.toLowerCase().includes(term.toLowerCase())) ??
    results[0];

  return { appId: best.appId, title: best.title, method: "search_fallback" };
}

export async function collectPlayStore(
  productName: string,
  playPackage?: string
): Promise<{ items: CollectedItem[]; resolvedTitle?: string; resolvedPackage?: string }> {
  const resolved = await resolvePlayStoreApp(productName, playPackage);
  if (!resolved) return { items: [] };

  const { data } = await gplay.reviews({
    appId: resolved.appId,
    lang: LANG,
    country: COUNTRY,
    sort: 2, // gplay.sort.NEWEST — using the raw value; the package's own type declarations mistype this enum
    num: MAX_REVIEWS,
  });

  const items: CollectedItem[] = data
    .filter((r) => r.text?.trim())
    .map((r) => ({
      id: `play_store_${r.id}`,
      source: "play_store",
      sourceLabel: "play_store",
      text: r.text,
      rating: r.score,
      date: r.date,
      url: `https://play.google.com/store/apps/details?id=${resolved.appId}`,
    }));

  return { items, resolvedTitle: resolved.title, resolvedPackage: resolved.appId };
}
