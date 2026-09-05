// Corpus preparation: dedupe, band assignment, shopper-type inference.
//
// Every reduction in item count that happens here is counted and reported in
// `Coverage` — the previous build's credibility problem was that 579 of 615
// items disappeared with no number anywhere saying so.

import type { CollectedItem, LabelledItem, RatingBand, RecencyBand, ShopperType } from "@/lib/types";
import { classifyDeductive } from "@/lib/taxonomy/deductive";

const MIN_USEFUL_CHARS = 3;

/** Normalised form used for duplicate detection. */
export function normalizeForDedupe(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type DedupeResult = { items: CollectedItem[]; duplicatesRemoved: number };

/**
 * Exact-duplicate removal on the normalised text. Deliberately not fuzzy:
 * near-duplicate clustering would start deleting genuinely distinct reviews
 * that happen to share phrasing ("worst app"), and every removal here changes
 * a denominator that ends up in a slide.
 */
export function dedupe(items: CollectedItem[]): DedupeResult {
  const seen = new Set<string>();
  const out: CollectedItem[] = [];
  let removed = 0;

  for (const item of items) {
    const text = item.text?.trim() ?? "";
    if (text.length < MIN_USEFUL_CHARS) {
      removed++;
      continue;
    }
    const key = normalizeForDedupe(text);
    if (!key || seen.has(key)) {
      removed++;
      continue;
    }
    seen.add(key);
    out.push(item);
  }

  return { items: out, duplicatesRemoved: removed };
}

export function ratingBand(rating?: number): RatingBand {
  if (typeof rating !== "number" || Number.isNaN(rating)) return "unrated";
  if (rating <= 2) return "detractor";
  if (rating === 3) return "passive";
  return "promoter";
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function recencyBand(date: string | undefined, now = Date.now()): RecencyBand {
  if (!date) return "unknown";
  const parsed = Date.parse(date);
  if (Number.isNaN(parsed)) return "unknown";
  const ageDays = (now - parsed) / DAY_MS;
  if (ageDays < 0) return "last_90d"; // clock skew on a freshly posted review
  if (ageDays <= 90) return "last_90d";
  if (ageDays <= 365) return "last_year";
  return "older";
}

// Shopper-type inference is deliberately evidence-gated: a type is only
// assigned when the text says so. Everything else stays null and is reported
// as "not inferable", because the brief asks how behaviour differs across
// segments — an invented segment answers that question falsely.
const SHOPPER_RULES: Array<{ type: ShopperType; re: RegExp }> = [
  { type: "occasion_buyer", re: /\b(wedding|sangeet|mehendi|haldi|reception|engagement|festive|diwali|navratri|puja|party\s+wear|office\s+wear|interview|anniversary|birthday\s+outfit)\b/i },
  { type: "size_conscious", re: /\b(size\s*chart|runs?\s+(small|large|big)|true\s+to\s+size|plus\s+size|petite|size\s+(issue|confusion|up|down)|measurement)\b/i },
  { type: "list_builder", re: /\b(wishlist|saved\s+items?|save\s+for\s+later|window\s+shopping|mood\s*board|cart\s+is\s+full)\b/i },
  { type: "gifter", re: /\b(gift(ing|ed)?|for\s+my\s+(mom|sister|wife|husband|friend|girlfriend|boyfriend)|present\s+for)\b/i },
  { type: "value_seeker", re: /\b(sale|discount|price\s+drop|eors|coupon|cheaper|budget|affordable|under\s+\d{3,4})\b/i },
  { type: "returner", re: /\b(return(ed|ing)?|exchange(d)?|refund(ed)?|pickup)\b/i },
];

/**
 * Returns the single best-evidenced shopper type, or null. Order matters only
 * as a tie-break: the first rule to match wins when two match, and the rules
 * are ordered most-specific-first (a post about a wedding outfit is an
 * occasion buyer even if it also says "sale").
 */
export function inferShopperType(text: string): ShopperType | null {
  for (const rule of SHOPPER_RULES) {
    if (rule.re.test(text)) return rule.type;
  }
  return null;
}

export const SHOPPER_TYPE_LABELS: Record<ShopperType | "unclassified", string> = {
  occasion_buyer: "Occasion buyer",
  size_conscious: "Size-conscious",
  list_builder: "List builder",
  gifter: "Gifting",
  value_seeker: "Value seeker",
  returner: "Frequent returner",
  unclassified: "Not inferable from text",
};

export const RATING_BAND_LABELS: Record<RatingBand, string> = {
  detractor: "1-2★ detractors",
  passive: "3★ passives",
  promoter: "4-5★ promoters",
  unrated: "Unrated (community/video)",
};

export const RECENCY_BAND_LABELS: Record<RecencyBand, string> = {
  last_90d: "Last 90 days",
  last_year: "91-365 days",
  older: "Over a year old",
  unknown: "No date available",
};

/** Apply the deductive frame and every derived band to the whole corpus. */
export function labelCorpus(items: CollectedItem[], now = Date.now()): LabelledItem[] {
  return items.map((item) => ({
    ...item,
    deductive: classifyDeductive(item.text),
    themeCode: null,
    sentiment: null,
    sampled: false,
    shopperType: inferShopperType(item.text),
    recency: recencyBand(item.date, now),
    ratingBand: ratingBand(item.rating),
  }));
}
