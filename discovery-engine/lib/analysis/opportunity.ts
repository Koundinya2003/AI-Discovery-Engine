// Opportunity scoring — the part the brief actually grades.
//
// A summariser tells you what people said. A decision instrument tells you
// which of those things is worth working on, shows its arithmetic, and lets a
// reader disagree with the weights rather than the vibe. Everything below is
// exported so the UI, /methodology, and the CSV export all render the same
// numbers from the same constants; there is no second copy of the formula.

import type { DeductiveCode } from "@/lib/taxonomy/deductive";
import { DEDUCTIVE_LABELS, DEDUCTIVE_OTHER, LEVERAGE_BY_CODE, deductiveLabel } from "@/lib/taxonomy/deductive";
import type { LabelledItem, OpportunityRow, Quote, Theme } from "@/lib/types";

// Problem size is a weighted sum; the score is that size GATED by leverage.
//
// The gate is multiplicative on purpose. An additive score lets a theme
// accumulate rank from volume alone, which is precisely the failure this tool
// exists to correct: post-delivery logistics dominates review volume because a
// review form is where you go after a delivery, and an additive model would
// therefore hand it the top of the table for a brief about wishlist
// conversion. Multiplying says the honest thing instead — a large problem
// that has little to do with the goal is not a large opportunity FOR THIS
// GOAL. It stays hand-computable: one weighted sum, one multiplication.
export const SCORING_WEIGHTS = {
  prevalence: 0.5,
  severity: 0.3,
  breadth: 0.2,
} as const;

export const SCORING_FORMULA =
  "Opportunity = 100 × Leverage × (0.50·Prevalence + 0.30·Severity + 0.20·Breadth)";

export const SCORING_COMPONENT_NOTES: Array<{ name: string; weight: number | null; definition: string }> = [
  {
    name: "Prevalence",
    weight: SCORING_WEIGHTS.prevalence,
    definition:
      "This theme's share of the corpus, divided by the largest theme's share in the same taxonomy. Normalised so the biggest theme scores 1.0 and the rest are read against it.",
  },
  {
    name: "Severity",
    weight: SCORING_WEIGHTS.severity,
    definition:
      "Share of this theme's rated items at 1-2★. When a theme has fewer than 5 rated items, the model's negative-sentiment share is used instead; when neither exists, the corpus-wide detractor rate is used as a neutral prior so unrated community themes are neither rewarded nor punished.",
  },
  {
    name: "Breadth",
    weight: SCORING_WEIGHTS.breadth,
    definition:
      "Distinct platforms carrying the theme ÷ platforms in the run. A theme present on Nykaa, Myntra and AJIO is a category problem worth solving structurally; one present on a single app may be a local defect.",
  },
  {
    name: "Leverage (multiplier)",
    weight: null,
    definition:
      "How directly the theme sits between 'saved to wishlist' and 'bought', 0-1, fixed per deductive label and published below. It multiplies the problem size rather than adding to it, so relevance to this specific goal gates the ranking instead of competing with volume. Inductive themes inherit the mean leverage of the deductive labels their items carry, so the value is derived from the data rather than assigned by hand.",
  },
];

const MIN_RATED_FOR_SEVERITY = 5;
/** The inductive taxonomy's mandatory catch-all, mirrored from the theme prompt. */
export const CATCH_ALL_CODE = "OTH";

export type ScoringContext = {
  /** Every platform in this run, for the breadth denominator. */
  platforms: string[];
  /** Corpus-wide share of rated items at 1-2★ — the neutral severity prior. */
  baselineDetractorRate: number;
};

export function buildScoringContext(corpus: LabelledItem[], platforms: string[]): ScoringContext {
  const rated = corpus.filter((i) => typeof i.rating === "number");
  const detractors = rated.filter((i) => (i.rating as number) <= 2).length;
  return {
    platforms,
    baselineDetractorRate: rated.length > 0 ? detractors / rated.length : 0,
  };
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function splitBy<T extends string>(items: LabelledItem[], pick: (i: LabelledItem) => T) {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(pick(item), (counts.get(pick(item)) ?? 0) + 1);
  const total = Math.max(1, items.length);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count, share: count / total }))
    .sort((a, b) => b.count - a.count);
}

/** Quotes round-robin across platform+source so one loud source can't own the card. */
export function pickQuotes(items: LabelledItem[], max: number): Quote[] {
  const buckets = new Map<string, LabelledItem[]>();
  for (const item of items) {
    const k = `${item.platform}·${item.sourceLabel}`;
    const arr = buckets.get(k) ?? [];
    arr.push(item);
    buckets.set(k, arr);
  }
  // Longer text first inside a bucket: a 3-word review makes a poor exhibit.
  for (const arr of buckets.values()) arr.sort((a, b) => b.text.length - a.text.length);

  const keys = [...buckets.keys()].sort();
  const quotes: Quote[] = [];
  for (let round = 0; quotes.length < max && keys.some((k) => (buckets.get(k)?.length ?? 0) > round); round++) {
    for (const k of keys) {
      if (quotes.length >= max) break;
      const candidate = buckets.get(k)![round];
      if (!candidate) continue;
      quotes.push({
        text: candidate.text.slice(0, 400),
        source: candidate.source,
        sourceLabel: candidate.sourceLabel,
        platform: candidate.platform,
        rating: candidate.rating,
        url: candidate.url,
      });
    }
  }
  return quotes;
}

type RowInput = {
  taxonomy: "deductive" | "inductive";
  code: string;
  title: string;
  definition: string;
  items: LabelledItem[];
  denominator: number;
  leverage: number;
};

function buildRow(input: RowInput, ctx: ScoringContext, maxShare: number): OpportunityRow {
  const { items } = input;
  const rated = items.filter((i) => typeof i.rating === "number");
  const meanRating = mean(rated.map((i) => i.rating as number));
  const detractorShare = rated.length > 0 ? rated.filter((i) => (i.rating as number) <= 2).length / rated.length : null;

  const withSentiment = items.filter((i) => i.sentiment !== null);
  const negativeShare =
    withSentiment.length > 0
      ? withSentiment.filter((i) => i.sentiment === "negative" || i.sentiment === "mixed").length / withSentiment.length
      : null;

  const shareOfCorpus = input.denominator > 0 ? items.length / input.denominator : 0;
  const prevalence = maxShare > 0 ? Math.min(1, shareOfCorpus / maxShare) : 0;

  const severity =
    rated.length >= MIN_RATED_FOR_SEVERITY && detractorShare !== null
      ? detractorShare
      : negativeShare !== null
        ? negativeShare
        : ctx.baselineDetractorRate;

  const platformsPresent = new Set(items.map((i) => i.platform));
  const breadth = ctx.platforms.length > 0 ? Math.min(1, platformsPresent.size / ctx.platforms.length) : 0;

  const components = {
    prevalence: round3(prevalence),
    severity: round3(severity),
    breadth: round3(breadth),
    leverage: round3(input.leverage),
    problemSize: round3(
      SCORING_WEIGHTS.prevalence * prevalence + SCORING_WEIGHTS.severity * severity + SCORING_WEIGHTS.breadth * breadth
    ),
  };

  const opportunityScore = 100 * components.leverage * components.problemSize;

  return {
    taxonomy: input.taxonomy,
    code: input.code,
    title: input.title,
    definition: input.definition,
    volume: items.length,
    shareOfCorpus: round3(shareOfCorpus),
    denominator: input.denominator,
    meanRating: meanRating === null ? null : Number(meanRating.toFixed(2)),
    ratedCount: rated.length,
    detractorShare: detractorShare === null ? null : round3(detractorShare),
    negativeShare: negativeShare === null ? null : round3(negativeShare),
    platformSplit: splitBy(items, (i) => i.platform).map((s) => ({
      platform: s.key,
      count: s.count,
      share: round3(s.share),
    })),
    sourceSplit: splitBy(items, (i) => i.sourceLabel).map((s) => ({
      sourceLabel: s.key,
      count: s.count,
      share: round3(s.share),
    })),
    components,
    opportunityScore: Number(opportunityScore.toFixed(1)),
    quotes: pickQuotes(items, 3),
    relativeFrequency: 0, // set by the caller once the max volume is known
  };
}

function round3(n: number): number {
  return Number(n.toFixed(3));
}

/** Mean leverage across a theme's items — each item scored by its strongest label. */
export function derivedLeverage(items: LabelledItem[]): number {
  if (items.length === 0) return 0;
  const perItem = items.map((item) => Math.max(0, ...item.deductive.map((c) => LEVERAGE_BY_CODE[c] ?? 0)));
  return perItem.reduce((a, b) => a + b, 0) / perItem.length;
}

/**
 * Deductive rows. Denominator is the WHOLE analysed corpus — every item
 * carries deductive labels, so shares here are true shares, not shares of a
 * sample. Multi-label means the shares intentionally sum to more than 100%.
 */
export function buildDeductiveRows(corpus: LabelledItem[], ctx: ScoringContext): OpportunityRow[] {
  const labels = [...DEDUCTIVE_LABELS, DEDUCTIVE_OTHER];
  const grouped = labels.map((label) => ({
    label,
    items: corpus.filter((i) => i.deductive.includes(label.code as DeductiveCode)),
  }));

  const denominator = corpus.length;
  const maxShare = denominator > 0 ? Math.max(0, ...grouped.map((g) => g.items.length / denominator)) : 0;

  const rows = grouped
    .filter((g) => g.items.length > 0)
    .map((g) =>
      buildRow(
        {
          taxonomy: "deductive",
          code: g.label.code,
          title: g.label.title,
          definition: g.label.definition,
          items: g.items,
          denominator,
          leverage: g.label.leverage,
        },
        ctx,
        maxShare
      )
    );

  const maxVolume = Math.max(1, ...rows.map((r) => r.volume));
  for (const r of rows) r.relativeFrequency = round3(r.volume / maxVolume);

  return rows.sort((a, b) => b.opportunityScore - a.opportunityScore || b.volume - a.volume);
}

/**
 * Inductive rows. Denominator is the number of items the model actually
 * returned a theme for — never the full corpus, because claiming a share of
 * 615 from 36 classified items is exactly the overclaim this rebuild removes.
 */
export function buildInductiveRows(themes: Theme[], corpus: LabelledItem[], ctx: ScoringContext): OpportunityRow[] {
  const classified = corpus.filter((i) => i.themeCode !== null);
  const denominator = classified.length;
  if (denominator === 0) return [];

  const grouped = themes.map((theme) => ({
    theme,
    items: classified.filter((i) => i.themeCode === theme.code),
  }));

  // The catch-all is "the model found nothing specific here" — a statement
  // about the data, not an opportunity area. It still appears in the table
  // (hiding it would overstate how much was really classified), but it is
  // pinned to zero leverage so it can never head the ranking.
  const leverageFor = (code: string, items: LabelledItem[]) => (code === CATCH_ALL_CODE ? 0 : derivedLeverage(items));

  const maxShare = Math.max(0, ...grouped.map((g) => g.items.length / denominator));

  const rows = grouped
    .filter((g) => g.items.length > 0)
    .map((g) =>
      buildRow(
        {
          taxonomy: "inductive",
          code: g.theme.code,
          title: g.theme.title,
          definition: g.theme.definition,
          items: g.items,
          denominator,
          leverage: leverageFor(g.theme.code, g.items),
        },
        ctx,
        maxShare
      )
    );

  const maxVolume = Math.max(1, ...rows.map((r) => r.volume));
  for (const r of rows) r.relativeFrequency = round3(r.volume / maxVolume);

  return rows.sort((a, b) => b.opportunityScore - a.opportunityScore || b.volume - a.volume);
}

/** The scoring block echoed into every run so a saved run explains itself. */
export function scoringManifest() {
  return {
    weights: { ...SCORING_WEIGHTS } as Record<string, number>,
    formula: SCORING_FORMULA,
    leverage: Object.fromEntries(
      [...DEDUCTIVE_LABELS, DEDUCTIVE_OTHER].map((l) => [`${l.code} — ${l.title}`, l.leverage])
    ) as Record<string, number>,
  };
}

export { deductiveLabel };
