// Channel coverage — what each source structurally can and cannot reveal.
//
// This panel exists because the honest finding of this project is a null
// result: app-store review channels are post-delivery by construction, so they
// cannot contain "I saved it and never bought it". Saying that plainly, with
// the live per-channel pre-purchase share next to it, is stronger than
// quietly presenting logistics complaints as if they answered the wishlist
// question. The static claims below are structural; the numbers beside them
// are measured per run, so the claim is testable rather than asserted.

import type { ChannelCoverageRow, LabelledItem, SourceKind, SourceStatus } from "@/lib/types";
import { hasPrePurchaseSignal } from "./segments";

export const CHANNEL_CLAIMS: Record<SourceKind, { canReveal: string[]; cannotReveal: string[] }> = {
  play_store: {
    canReveal: [
      "Post-delivery failure modes at volume: delivery, returns, refunds, support",
      "App reliability and checkout friction, with a star rating attached",
      "Platform-to-platform comparison, since every app has the same channel",
    ],
    cannotReveal: [
      "Why a saved item was never bought — the reviewer has already transacted",
      "Browsing and shortlisting behaviour that happens before an order exists",
      "The silent majority who abandoned without ever writing a review",
    ],
  },
  app_store: {
    canReveal: [
      "The same post-delivery signal as Play, on a smaller, higher-income iOS sample",
      "Rated, dated text usable for recency and severity cuts",
    ],
    cannotReveal: [
      "Pre-purchase hesitation, for the same structural reason as Play Store",
      "Anything about users who never installed the app",
    ],
  },
  reddit: {
    canReveal: [
      "Pre-purchase deliberation in the user's own words: should I buy, which size, is it worth it",
      "Cross-platform comparison shopping, unattached to any one brand's review form",
      "Community answers, i.e. what people substitute for the information the PDP lacks",
    ],
    cannotReveal: [
      "Representative volume — posters are a self-selected, more engaged minority",
      "A star rating or any structured severity measure",
      "Whether the post's author actually purchased afterwards",
    ],
  },
  youtube: {
    canReveal: [
      "Haul and try-on discussion, which is fit evidence users seek off-platform",
      "Reactions in comments from people considering the same purchase",
    ],
    cannotReveal: [
      "Attribution to a specific platform, since one video may cover several",
      "Anything rated, dated consistently, or free of promotional noise",
    ],
  },
};

export const CHANNEL_LABELS: Record<SourceKind, string> = {
  play_store: "Play Store reviews",
  app_store: "App Store reviews",
  reddit: "Reddit communities",
  youtube: "YouTube comments",
};

export function buildChannelCoverage(corpus: LabelledItem[], sources: SourceStatus[]): ChannelCoverageRow[] {
  return sources.map((status) => {
    const items = corpus.filter((i) => i.source === status.source);
    const prePurchaseCount = items.filter(hasPrePurchaseSignal).length;
    return {
      source: status.source,
      label: CHANNEL_LABELS[status.source],
      collected: items.length,
      canReveal: CHANNEL_CLAIMS[status.source].canReveal,
      cannotReveal: CHANNEL_CLAIMS[status.source].cannotReveal,
      prePurchaseShare: items.length > 0 ? Number((prePurchaseCount / items.length).toFixed(3)) : null,
      prePurchaseCount,
    };
  });
}
