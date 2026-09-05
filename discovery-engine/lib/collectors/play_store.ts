// Google Play Store collector.
//
// COMPLIANCE: `google-play-scraper` is an unofficial library hitting Google's
// public (undocumented) endpoints — a ToS gray area, not an official API. Keep
// per-run volume modest (capped below) and see README for the full disclosure.
//
// BUG FIX vs. the old Streamlit app: `search()` on a multi-word query (e.g.
// "Nykaa Fashion") can return an unrelated top hit (it once returned Myntra).
// This module never trusts a bare multi-word search():
//   1. An exact package (supplied, or a verified hint from the platform
//      registry) resolves with `app()` directly — no search, no ambiguity.
//   2. Otherwise `search()` runs on the single most brand-distinctive word.
// Either way the resolved title must contain one of the platform's expected
// tokens, or the source reports "no confident match" and collects nothing —
// far better than silently filling the corpus with a competitor's reviews,
// which matters doubly now that competitors are deliberately part of the run.

import gplay from "google-play-scraper";
import type { CollectedItem } from "@/lib/types";
import { withRetry } from "@/lib/http";
import { SourceUnavailableError } from "@/lib/errors";
import type { PlatformSpec } from "@/lib/platforms";
import { titleMatches } from "./app_store";

const COUNTRY = "in";
const LANG = "en";
const MAX_REVIEWS = 300; // keep per-run volume modest, per compliance notes
const CALL_TIMEOUT_MS = 9000;

/**
 * google-play-scraper calls are plain promises with no built-in timeout —
 * unlike raw fetch calls elsewhere there's no AbortController to hook into,
 * so a hung request is bounded with Promise.race instead.
 */
function withTimeout<T>(promise: Promise<T>, ms = CALL_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new SourceUnavailableError("timeout", `play store ${ms}ms`)), ms)),
  ]);
}

// Words describing the app's category rather than identifying the brand
// ("Nykaa Fashion" -> the brand word is "Nykaa", not "Fashion").
const GENERIC_SUFFIX_WORDS = new Set([
  "the", "a", "an", "app", "apps", "for", "and", "store", "online", "mobile",
  "lite", "pro", "plus", "go", "official", "get", "my", "fashion", "shopping",
]);

export function mostDistinctiveWord(productName: string): string {
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
    const app = await withTimeout(gplay.app({ appId: pkg, lang: LANG, country: COUNTRY }));
    return { appId: app.appId, title: app.title };
  } catch {
    return null;
  }
}

export async function resolvePlayStoreApp(
  platform: PlatformSpec
): Promise<{ appId: string; title: string; method: "exact_package" | "search_fallback" }> {
  if (platform.playPackage) {
    const exact = await resolveByExactPackage(platform.playPackage);
    // A package hint still has to survive the title check — a package that
    // 404s or gets reassigned should fall through to search, not be trusted.
    if (exact && titleMatches(exact.title, platform.titleMustMatch)) {
      return { ...exact, method: "exact_package" };
    }
  }

  const term = mostDistinctiveWord(platform.label);
  const results = await withRetry(() => withTimeout(gplay.search({ term, num: 10, lang: LANG, country: COUNTRY })));
  if (!results.length) throw new SourceUnavailableError("no_results", `play search empty for ${term}`);

  const best = results.find((r) => titleMatches(r.title, platform.titleMustMatch));
  if (!best) throw new SourceUnavailableError("no_confident_match", `top hit ${results[0]?.title}`);

  return { appId: best.appId, title: best.title, method: "search_fallback" };
}

export async function collectPlayStore(
  platform: PlatformSpec
): Promise<{ items: CollectedItem[]; resolvedTitle: string }> {
  const resolved = await resolvePlayStoreApp(platform);

  const { data } = await withRetry(() =>
    withTimeout(
      gplay.reviews({
        appId: resolved.appId,
        lang: LANG,
        country: COUNTRY,
        sort: 2, // gplay.sort.NEWEST — raw value; the package mistypes this enum
        num: MAX_REVIEWS,
      })
    )
  );

  const items: CollectedItem[] = data
    .filter((r) => r.text?.trim())
    .map((r) => ({
      id: `play_store_${platform.key}_${r.id}`,
      source: "play_store",
      sourceLabel: "play_store",
      platform: platform.label,
      text: r.text,
      rating: r.score,
      date: r.date,
      url: `https://play.google.com/store/apps/details?id=${resolved.appId}`,
    }));

  return { items, resolvedTitle: resolved.title };
}
