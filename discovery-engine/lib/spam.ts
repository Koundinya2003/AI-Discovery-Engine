// Lightweight spam/ad filter applied to collected items before they reach
// theme discovery or classification — keeps promotional junk (most common in
// YouTube comments) from being counted as thematic signal or surfaced as a
// representative quote. Deliberately conservative (multi-word phrases and
// URL shorteners, not single generic words like "free") to avoid false-
// positiving on legitimate complaints that happen to mention e.g. a promo
// code that didn't work.

const SPAM_PATTERNS: RegExp[] = [
  /\bsign\s?up\s+(now|today|free)\b/i,
  /\bfree\s+trial\b/i,
  /\bclick\s+(the\s+)?link\b/i,
  /\bclick\s+here\b/i,
  /\blink\s+in\s+(my\s+)?bio\b/i,
  /\bsubscribe\s+to\s+(my|our)\s+channel\b/i,
  /\bcheck\s+out\s+my\s+(channel|page|profile)\b/i,
  // Deliberately NOT matching bare "promo code" / "discount code" — those show
  // up constantly in legitimate complaints ("my promo code didn't work").
  // Only the imperative CTA form ("use code SAVE20") is spam-specific enough.
  /\buse\s+code\s+\w+/i,
  /\bdm\s+me\s+(for|to)\b/i,
  /\bwhatsapp\s+me\b/i,
  /\bearn\s+\$?\d+\s*(a|per)\s*(day|hour|week)\b/i,
  /\bmake\s+money\s+(fast|online|from\s+home)\b/i,
  /\bwork\s+from\s+home\s+and\s+earn\b/i,
  /\bbit\.ly\//i,
  /\btinyurl\.com\//i,
  /\bt\.me\//i,
  /\bwa\.me\//i,
];

export function isLikelySpam(text: string): boolean {
  if (!text) return false;
  return SPAM_PATTERNS.some((re) => re.test(text));
}
