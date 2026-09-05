// Segment cuts — "how do these behaviours differ across user segments?"
//
// Cuts run over the whole analysed corpus (deductive labels are 100%
// coverage), so a segment's numbers are real shares rather than shares of a
// sample. Each row reports its top labels and its pre-purchase share, which is
// the one number that speaks directly to the wishlist question.

import type { LabelledItem, SegmentCuts, SegmentRow } from "@/lib/types";
import { PRE_PURCHASE_CODES, deductiveLabel } from "@/lib/taxonomy/deductive";
import { RATING_BAND_LABELS, RECENCY_BAND_LABELS, SHOPPER_TYPE_LABELS } from "@/lib/corpus";

const TOP_LABELS_PER_SEGMENT = 4;
const PRE_PURCHASE = new Set<string>(PRE_PURCHASE_CODES);

export function hasPrePurchaseSignal(item: LabelledItem): boolean {
  return item.deductive.some((code) => PRE_PURCHASE.has(code));
}

function buildRow(segment: string, items: LabelledItem[], corpusSize: number): SegmentRow {
  const rated = items.filter((i) => typeof i.rating === "number");
  const meanRating =
    rated.length > 0 ? Number((rated.reduce((a, b) => a + (b.rating as number), 0) / rated.length).toFixed(2)) : null;

  const labelCounts = new Map<string, number>();
  for (const item of items) {
    for (const code of item.deductive) labelCounts.set(code, (labelCounts.get(code) ?? 0) + 1);
  }

  const denom = Math.max(1, items.length);
  const topLabels = [...labelCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_LABELS_PER_SEGMENT)
    .map(([code, count]) => ({
      code,
      title: deductiveLabel(code as never).title,
      count,
      share: Number((count / denom).toFixed(3)),
    }));

  return {
    segment,
    count: items.length,
    share: corpusSize > 0 ? Number((items.length / corpusSize).toFixed(3)) : 0,
    meanRating,
    topLabels,
    prePurchaseShare: Number((items.filter(hasPrePurchaseSignal).length / denom).toFixed(3)),
  };
}

function cut(
  corpus: LabelledItem[],
  keyOf: (item: LabelledItem) => string,
  order?: string[]
): SegmentRow[] {
  const groups = new Map<string, LabelledItem[]>();
  for (const item of corpus) {
    const k = keyOf(item);
    const arr = groups.get(k) ?? [];
    arr.push(item);
    groups.set(k, arr);
  }

  const rows = [...groups.entries()].map(([segment, items]) => buildRow(segment, items, corpus.length));

  if (order) {
    const rank = new Map(order.map((label, i) => [label, i]));
    return rows.sort((a, b) => (rank.get(a.segment) ?? 99) - (rank.get(b.segment) ?? 99) || b.count - a.count);
  }
  return rows.sort((a, b) => b.count - a.count);
}

export function buildSegments(corpus: LabelledItem[]): SegmentCuts {
  return {
    byPlatform: cut(corpus, (i) => i.platform),
    byRatingBand: cut(corpus, (i) => RATING_BAND_LABELS[i.ratingBand], [
      RATING_BAND_LABELS.detractor,
      RATING_BAND_LABELS.passive,
      RATING_BAND_LABELS.promoter,
      RATING_BAND_LABELS.unrated,
    ]),
    byRecency: cut(corpus, (i) => RECENCY_BAND_LABELS[i.recency], [
      RECENCY_BAND_LABELS.last_90d,
      RECENCY_BAND_LABELS.last_year,
      RECENCY_BAND_LABELS.older,
      RECENCY_BAND_LABELS.unknown,
    ]),
    byShopperType: cut(corpus, (i) => SHOPPER_TYPE_LABELS[i.shopperType ?? "unclassified"]),
  };
}
