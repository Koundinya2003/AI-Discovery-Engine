// Shared types for the discovery pipeline:
//   collect -> dedupe -> deductive labelling (100%) -> stratified LLM sample
//   -> inductive theme induction + classification -> scoring/segments -> UI.

import type { UnavailableReason } from "@/lib/errors";
import type { DeductiveCode } from "@/lib/taxonomy/deductive";

export type SourceKind = "app_store" | "play_store" | "youtube" | "reddit";

export type CollectedItem = {
  id: string;
  source: SourceKind;
  /** Fine-grained label, e.g. "app_store", "youtube", "r/IndianFashionAddicts" */
  sourceLabel: string;
  /** Which shopping platform this item is evidence about. */
  platform: string;
  text: string;
  rating?: number;
  date?: string;
  url: string;
};

/** An item after the deductive pass — every collected item gets one of these. */
export type LabelledItem = CollectedItem & {
  /** Fixed-frame labels. Multi-label; never empty (falls back to OTHER). */
  deductive: DeductiveCode[];
  /** Inductive theme code, or null when the item wasn't in the LLM sample. */
  themeCode: string | null;
  /** Sentiment from the LLM pass; null when not sampled. */
  sentiment: Sentiment | null;
  /** True when this item was drawn into the LLM sample. */
  sampled: boolean;
  /** Rule-inferred shopper type, or null when the text carries no signal. */
  shopperType: ShopperType | null;
  /** Recency bucket derived from `date`. */
  recency: RecencyBand;
  /** Rating band, "unrated" for sources with no star rating. */
  ratingBand: RatingBand;
};

export type Sentiment = "positive" | "negative" | "neutral" | "mixed";
export type RatingBand = "detractor" | "passive" | "promoter" | "unrated";
export type RecencyBand = "last_90d" | "last_year" | "older" | "unknown";
export type ShopperType =
  | "occasion_buyer"
  | "size_conscious"
  | "value_seeker"
  | "returner"
  | "list_builder"
  | "gifter";

export type SourceStatus = {
  source: SourceKind;
  /** Display label, e.g. "Play Store" or "Reddit". */
  label: string;
  count: number;
  /** Per-platform or per-subreddit breakdown of `count`. */
  breakdown: Array<{ label: string; count: number }>;
  /** Present only when the source produced nothing usable. Always sanitised. */
  unavailable?: { reason: UnavailableReason; headline: string; detail: string };
  /** Items the source returned but this run rejected, with the reason. */
  rejected?: Array<{ label: string; count: number }>;
};

export type Theme = {
  code: string;
  title: string;
  definition: string;
};

export type ClassifiedTag = {
  itemId: string;
  themeCode: string;
  sentiment: Sentiment;
  confidence: number;
  /** The model's own deductive labels for this item, used for the audit stat. */
  deductive: DeductiveCode[];
};

export type Quote = {
  text: string;
  source: SourceKind;
  sourceLabel: string;
  platform: string;
  rating?: number;
  url: string;
};

/** One row of the ranked opportunity table — the deck's decision instrument. */
export type OpportunityRow = {
  taxonomy: "deductive" | "inductive";
  code: string;
  title: string;
  definition: string;
  /** Items carrying this theme. */
  volume: number;
  /** volume / corpus size for this taxonomy's denominator. */
  shareOfCorpus: number;
  /** Denominator `shareOfCorpus` is computed against, stated for transparency. */
  denominator: number;
  meanRating: number | null;
  ratedCount: number;
  /** Share of this theme's rated items at 1-2 stars. */
  detractorShare: number | null;
  negativeShare: number | null;
  platformSplit: Array<{ platform: string; count: number; share: number }>;
  sourceSplit: Array<{ sourceLabel: string; count: number; share: number }>;
  /**
   * Scoring inputs, all 0-1, published so the score can be recomputed by hand.
   * `problemSize` is the weighted sum of the first three; the score is that
   * size multiplied by `leverage`.
   */
  components: { prevalence: number; severity: number; breadth: number; leverage: number; problemSize: number };
  opportunityScore: number;
  quotes: Quote[];
  /** Inductive themes only: relative bar width vs. the largest theme. */
  relativeFrequency: number;
};

export type SegmentRow = {
  segment: string;
  count: number;
  share: number;
  meanRating: number | null;
  /** Top deductive labels inside this segment, by share of the segment. */
  topLabels: Array<{ code: string; title: string; count: number; share: number }>;
  /** Share of the segment carrying at least one pre-purchase label. */
  prePurchaseShare: number;
};

export type SegmentCuts = {
  byPlatform: SegmentRow[];
  byRatingBand: SegmentRow[];
  byRecency: SegmentRow[];
  byShopperType: SegmentRow[];
};

export type ChannelCoverageRow = {
  source: SourceKind;
  label: string;
  collected: number;
  /** What this channel structurally can and cannot surface. */
  canReveal: string[];
  cannotReveal: string[];
  /** Live evidence: share of this channel's items carrying a pre-purchase label. */
  prePurchaseShare: number | null;
  prePurchaseCount: number;
};

export type Coverage = {
  scraped: number;
  duplicatesRemoved: number;
  /** Items in the analysed corpus (post-dedupe). Deductive coverage is 100%. */
  analysed: number;
  deductivelyClassified: number;
  deductiveCoveragePct: number;
  /** How many analysed items were drawn into the LLM sample. */
  llmSampled: number;
  /** How many of those the LLM actually returned a theme for. */
  llmClassified: number;
  llmCoveragePct: number;
  /** Human-readable statement of the sampling rule actually applied. */
  samplingRule: string;
  /** Strata actually drawn, so the sample is auditable rather than asserted. */
  strata: Array<{ stratum: string; population: number; drawn: number }>;
  /** Share of audited items where rules and the model agreed on ≥1 label. */
  ruleModelAgreement: number | null;
  ruleModelAudited: number;
};

export type DiscoverRequest = {
  productName: string;
  comparisonPlatforms?: string[];
  appStoreId?: string;
  playPackage?: string;
};

export type RunResult = {
  runId: string;
  createdAt: string;
  productName: string;
  platforms: string[];
  sources: SourceStatus[];
  coverage: Coverage;
  /** Inductive themes discovered from the sample (may be empty if LLM is down). */
  themes: OpportunityRow[];
  /** Deductive frame, always populated — it needs no LLM. */
  deductive: OpportunityRow[];
  segments: SegmentCuts;
  channels: ChannelCoverageRow[];
  /** Scoring weights, echoed so the UI and a deck can show the same formula. */
  scoring: { weights: Record<string, number>; formula: string; leverage: Record<string, number> };
  /** The labelled corpus, used by the Ask box and the CSV/JSON export. */
  corpus: LabelledItem[];
  notices: Notice[];
  cached?: boolean;
  /** True when the run is persisted and /run/{id} will resolve. */
  persisted: boolean;
};

export type Notice = {
  level: "info" | "warn";
  /** Short, already-sanitised, user-facing text. */
  message: string;
};

/** Progress events streamed from /api/discover while a run is in flight. */
export type ProgressEvent =
  | { type: "stage"; stage: string; label: string; detail?: string }
  | { type: "source"; source: SourceKind; label: string; count: number; state: "done" | "unavailable" }
  | { type: "counts"; scraped: number; analysed: number; sampled: number; classified: number }
  | { type: "result"; result: RunResult }
  | { type: "error"; message: string; retryAfterSeconds?: number };

export type AskRequest = {
  question: string;
  corpus: Array<Pick<LabelledItem, "id" | "text" | "sourceLabel" | "platform" | "themeCode" | "deductive">>;
  themes: Array<Pick<OpportunityRow, "code" | "title">>;
};

export type AskResponse = {
  answer: string;
  usedThemeCodes: string[];
  sourceCount: number;
};
