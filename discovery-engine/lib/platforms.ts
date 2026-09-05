// Platform registry — the comparison corpus.
//
// The brief is about *online fashion shopping*, not one retailer, so a run
// collects the primary platform plus comparison platforms and labels every
// item with which platform it came from. That's what makes "is this a Nykaa
// problem or a category problem?" answerable instead of assumed.
//
// App Store IDs are deliberately NOT hardcoded: a wrong numeric ID silently
// pulls a different app's reviews into the corpus, which is exactly the class
// of invisible error this rebuild exists to remove. Instead each platform
// carries `titleMustMatch` tokens; the collector resolves by name and only
// accepts a match whose resolved title contains one of them. Play packages
// ARE hinted because an exact package is verifiable on the spot (the resolved
// title is checked against the same tokens) and skips ambiguous search.

export type PlatformKey = string;

export type PlatformSpec = {
  key: PlatformKey;
  /** Display name, also the query used against each source. */
  label: string;
  /** Play Store package hint. Verified against titleMustMatch before use. */
  playPackage?: string;
  /** App Store numeric id, only when supplied by the caller at request time. */
  appStoreId?: string;
  /**
   * Lowercase tokens that must appear in a resolved app title for the match to
   * be accepted. Prevents "Nykaa Fashion" resolving to Myntra, which is the
   * original bug this project was built to fix.
   */
  titleMustMatch: string[];
  /** Brand tokens used to attribute a community (Reddit) post to a platform. */
  brandTokens: string[];
};

const REGISTRY: Record<string, Omit<PlatformSpec, "key" | "label">> = {
  "nykaa fashion": {
    playPackage: "com.fsn.nds",
    titleMustMatch: ["nykaa"],
    brandTokens: ["nykaa fashion", "nykaafashion", "nykaa"],
  },
  nykaa: {
    playPackage: "com.fsn.nds",
    titleMustMatch: ["nykaa"],
    brandTokens: ["nykaa fashion", "nykaafashion", "nykaa"],
  },
  myntra: {
    playPackage: "com.myntra.android",
    titleMustMatch: ["myntra"],
    brandTokens: ["myntra"],
  },
  ajio: {
    playPackage: "com.ril.ajio",
    titleMustMatch: ["ajio"],
    brandTokens: ["ajio"],
  },
};

/** Stable, URL/CSV-safe key for a platform label. */
export function platformKey(label: string): PlatformKey {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Build a platform spec for any label. Known Indian fashion platforms get
 * verified package hints and brand tokens; anything else still works, it just
 * resolves purely by name and uses its own words as brand tokens.
 */
export function resolvePlatform(label: string, overrides: { appStoreId?: string; playPackage?: string } = {}): PlatformSpec {
  const normalized = label.trim().toLowerCase();
  const known = REGISTRY[normalized];
  const fallbackTokens = normalized.split(/\s+/).filter((w) => w.length > 2);

  return {
    key: platformKey(label),
    label: label.trim(),
    playPackage: overrides.playPackage || known?.playPackage,
    appStoreId: overrides.appStoreId,
    titleMustMatch: known?.titleMustMatch ?? (fallbackTokens.length ? fallbackTokens : [normalized]),
    brandTokens: known?.brandTokens ?? (fallbackTokens.length ? fallbackTokens : [normalized]),
  };
}

/** The default comparison set for the fashion-wishlist brief. */
export const DEFAULT_COMPARISON_PLATFORMS = ["Myntra", "AJIO"];

/** Platform label used for community items that name no single platform. */
export const CROSS_PLATFORM_LABEL = "Cross-platform";

/**
 * Attribute a free-text community post to a platform by brand mention. Returns
 * CROSS_PLATFORM_LABEL when zero or more than one brand is named, so a post
 * comparing two retailers is never miscounted as evidence about just one.
 */
export function attributePlatform(text: string, platforms: PlatformSpec[]): string {
  const haystack = text.toLowerCase();
  const hits = platforms.filter((p) => p.brandTokens.some((t) => haystack.includes(t)));
  return hits.length === 1 ? hits[0].label : CROSS_PLATFORM_LABEL;
}
