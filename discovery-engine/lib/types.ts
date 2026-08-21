// Shared types for the discovery pipeline: collectors -> theme discovery -> classification -> UI.

export type SourceKind = "app_store" | "play_store" | "youtube" | "forum";

export type CollectedItem = {
  id: string;
  source: SourceKind;
  /** Fine-grained label, e.g. "app_store", "play_store", "youtube", or a forum domain like "onlytech_forum" */
  sourceLabel: string;
  text: string;
  rating?: number;
  date?: string;
  url: string;
};

export type SourceStat = {
  source: SourceKind;
  label: string;
  count: number;
  error?: string;
};

export type CollectionResult = {
  items: CollectedItem[];
  stats: SourceStat[];
  resolvedAppStoreTitle?: string;
  resolvedPlayStoreTitle?: string;
  resolvedAppStoreId?: string;
  resolvedPlayPackage?: string;
};

export type Theme = {
  code: string;
  title: string;
  definition: string;
};

export type ClassifiedTag = {
  itemId: string;
  themeCode: string;
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  confidence: number;
};

export type ThemeResult = {
  code: string;
  title: string;
  definition: string;
  count: number;
  relativeFrequency: number; // count / max(count) across themes
  quotes: Array<{
    text: string;
    source: SourceKind;
    sourceLabel: string;
    url: string;
  }>;
};

export type DiscoverRequest = {
  productName: string;
  appStoreId?: string;
  playPackage?: string;
};

export type DiscoverResponse = {
  productName: string;
  stats: SourceStat[];
  totals: {
    scraped: number;
    classified: number;
  };
  resolvedAppStoreTitle?: string;
  resolvedPlayStoreTitle?: string;
  themes: ThemeResult[];
  /** Full classified corpus, sent back to the client so the Ask box can run retrieval without re-collecting. */
  corpus: Array<CollectedItem & { themeCode: string; sentiment: ClassifiedTag["sentiment"] }>;
  warnings: string[];
};

export type AskRequest = {
  question: string;
  corpus: DiscoverResponse["corpus"];
  themes: ThemeResult[];
};

export type AskResponse = {
  answer: string;
  usedThemeCodes: string[];
  sourceCount: number;
};
