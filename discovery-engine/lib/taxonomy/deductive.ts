// The deductive frame: a fixed taxonomy derived from the brief, applied to
// 100% of the analysed corpus by deterministic rules — no LLM, no token
// budget, no sampling, no silent drops.
//
// Why rules and not the model for this layer: the free-tier TPM ceiling caps
// how many items an LLM can label per run at a few dozen. A brief that asks
// to "quantify and compare opportunity areas" needs a denominator covering
// every item, not 6% of them. Rules give that, and they are auditable — every
// pattern below is published on /methodology, so any number in the deck can be
// traced to the exact string that produced it. The LLM layer still runs on a
// stratified sample and its labels are compared against these rules; that
// agreement rate is reported as `coverage.ruleModelAgreement` rather than
// assumed.
//
// Labels are multi-label on purpose: "wrong size delivered, return pickup
// never came" is genuinely both FIT_SIZE and LOGISTICS_CX, and forcing a
// single winner is how the previous build lost the fit signal underneath the
// logistics volume.

export const DEDUCTIVE_CODES = [
  "FIT_SIZE",
  "FIT_EVIDENCE",
  "PRICE_WAIT",
  "STYLING_OCCASION",
  "COMPARISON",
  "SOCIAL_VALIDATION",
  "TRUST_QUALITY",
  "BOOKMARKING",
  "LOGISTICS_CX",
  "OTHER",
] as const;

export type DeductiveCode = (typeof DEDUCTIVE_CODES)[number];

export type DeductiveLabel = {
  code: DeductiveCode;
  title: string;
  definition: string;
  /**
   * Does this label describe a hesitation that sits between "saved it" and
   * "bought it"? Drives the channel-coverage evidence and the segment cuts.
   */
  prePurchase: boolean;
  /**
   * Leverage on the business goal (wishlist -> purchase within 30 days), 0-1.
   * Published, fixed, and applied identically to every run so two runs are
   * comparable. Monetary incentives are out of scope for this brief, which is
   * why PRICE_WAIT is mid-band rather than high: the non-monetary levers on it
   * (price-drop alerts, sale-timing transparency) are real but narrower than
   * removing a fit or trust doubt.
   */
  leverage: number;
  /** Weighted patterns. An item is labelled when matched weights reach 1.0. */
  patterns: Array<{ re: RegExp; weight: number }>;
  /** Patterns that veto the label outright, regardless of score. */
  vetoes?: RegExp[];
};

const MATCH_THRESHOLD = 1;

// Shared fragments. Indian fashion e-commerce vocabulary is specific enough
// that a generic English lexicon under-reads it ("EORS", "first copy", "COD",
// "mehendi"), so these are written against how the reviews actually read.
export const DEDUCTIVE_LABELS: DeductiveLabel[] = [
  {
    code: "FIT_SIZE",
    title: "Fit & size uncertainty",
    definition:
      "Doubt about what size to order, or brand-to-brand size inconsistency: size charts, runs small/large, fitting, measurements.",
    prePurchase: true,
    leverage: 1.0,
    patterns: [
      { re: /\bsize\s*(chart|guide|char|chat)\b/i, weight: 1 },
      { re: /\bruns?\s+(small|large|big|tight|loose)\b/i, weight: 1 },
      { re: /\b(one|two|1|2)\s+size(s)?\s+(up|down|bigger|smaller)\b/i, weight: 1 },
      { re: /\bsiz(e|ing)\s+(issue|problem|confusion|inconsisten\w*|vary|varies|different|mismatch|guide)\b/i, weight: 1 },
      { re: /\bwhat\s+size\b|\bwhich\s+size\b|\bsize\s+kya\b/i, weight: 1 },
      { re: /\b(too|very|bahut)\s+(tight|loose|small|large|big|short|long)\b/i, weight: 1 },
      { re: /\bfit(ting|s|ted)?\s+(issue|problem|is\s+(bad|poor|weird|off)|not\s+(good|right|proper))\b/i, weight: 1 },
      { re: /\bdoes\s*n[o']?t\s+fit\b|\bdidn[o']?t\s+fit\b|\bnot\s+fitting\b/i, weight: 1 },
      { re: /\b(true\s+to\s+size|tts)\b/i, weight: 1 },
      { re: /\b(measurement|bust|waist|inseam|shoulder\s+width|length)\b/i, weight: 0.5 },
      { re: /\bsize\b/i, weight: 0.5 },
      { re: /\bfit(ting)?\b/i, weight: 0.5 },
      { re: /\b(xs|xxl|xxxl|3xl|4xl)\b/i, weight: 0.5 },
    ],
  },
  {
    code: "FIT_EVIDENCE",
    title: "Wants proof on a real body",
    definition:
      "Wants to see the item on someone real before buying: worn photos, model height/size, customer photos, video, how it looks in person.",
    prePurchase: true,
    leverage: 0.95,
    patterns: [
      { re: /\b(customer|buyer|user|real|actual)\s+(photo|pic|picture|image|review\s+photo)s?\b/i, weight: 1 },
      { re: /\bphoto(s)?\s+(of|from)\s+(actual|real|other)\s+(customer|buyer|user|people)\b/i, weight: 1 },
      { re: /\bmodel[' ]?s?\s+(height|size|is\s+wearing|wearing)\b/i, weight: 1 },
      { re: /\bwhat\s+size\s+is\s+the\s+model\b/i, weight: 1 },
      { re: /\b(looks?|looked)\s+(completely\s+)?different\s+(in\s+(person|real|reality)|from\s+the\s+(photo|picture|image))/i, weight: 1 },
      { re: /\bnot\s+(the\s+)?same\s+as\s+(the\s+)?(photo|picture|image|website|app)\b/i, weight: 1 },
      { re: /\b(try[- ]?on|tryon)\b/i, weight: 1 },
      { re: /\bon\s+(a\s+)?(real|actual)\s+(body|person)\b/i, weight: 1 },
      { re: /\b(worn|wearing)\s+(photo|pic|picture|shot)s?\b/i, weight: 1 },
      { re: /\b(360|zoom)\s+(view|photo|image)\b/i, weight: 1 },
      { re: /\bpicture\s+(is\s+)?misleading\b/i, weight: 1 },
      { re: /\bshow(n|s)?\s+in\s+(the\s+)?(picture|photo|image|app)\b/i, weight: 0.5 },
      { re: /\breview\s+(photo|pic|image)s?\b/i, weight: 0.5 },
    ],
  },
  {
    code: "PRICE_WAIT",
    title: "Waiting for a price drop",
    definition:
      "Saving the item until it goes on sale, tracking price movement, or holding out for a specific sale event.",
    prePurchase: true,
    leverage: 0.45,
    patterns: [
      { re: /\bwait(ing)?\s+for\s+(the\s+)?(sale|discount|offer|price\s+drop|eors|big\s+fashion)/i, weight: 1 },
      { re: /\bprice\s+drop(s|ped)?\b/i, weight: 1 },
      { re: /\b(eors|end\s+of\s+reason\s+sale|big\s+fashion\s+days|pink\s+friday)\b/i, weight: 1 },
      { re: /\b(add|added|keep|keeping|put)\s+.{0,24}(wishlist|cart)\s+.{0,24}(sale|discount|price)/i, weight: 1 },
      { re: /\buntil\s+(it|they)\s+.{0,15}(sale|discount|cheaper)/i, weight: 1 },
      { re: /\bprice\s+(track|alert|watch|history)\b/i, weight: 1 },
      { re: /\bwill\s+buy\s+.{0,20}\bsale\b/i, weight: 1 },
      { re: /\b(too|very)\s+(expensive|costly|pricey)\b/i, weight: 0.5 },
      { re: /\b(sale|discount|offer)\b/i, weight: 0.5 },
      { re: /\bprice\b/i, weight: 0.5 },
    ],
  },
  {
    code: "STYLING_OCCASION",
    title: "Unsure how or where to wear it",
    definition:
      "Doesn't know what to pair it with, whether it suits the occasion, the season, or a body type / personal style.",
    prePurchase: true,
    leverage: 0.7,
    patterns: [
      { re: /\bhow\s+(to|do\s+i|would\s+i)\s+(style|pair|wear)\b/i, weight: 1 },
      { re: /\bwhat\s+(to|should\s+i)\s+(pair|wear)\s+(it\s+)?with\b/i, weight: 1 },
      { re: /\bstyl(e|ing)\s+(tip|idea|advice|help|suggestion)s?\b/i, weight: 1 },
      { re: /\b(suitable|appropriate|okay|ok)\s+for\s+(a\s+)?(wedding|office|party|college|interview|function|sangeet|mehendi|haldi|puja|festive)/i, weight: 1 },
      { re: /\b(wedding|sangeet|mehendi|haldi|reception|engagement|festive|diwali|karwa|puja|navratri)\b.{0,40}\b(wear|outfit|dress|look|buy)\b/i, weight: 1 },
      { re: /\b(office|formal|casual|party|brunch|date)\s+(wear|look|outfit)\b/i, weight: 1 },
      { re: /\b(body\s+type|apple\s+shape|pear\s+shape|petite|plus\s+size|tall\s+girls?)\b/i, weight: 1 },
      { re: /\b(summer|winter|monsoon)\s+(wear|outfit|collection|friendly)\b/i, weight: 1 },
      { re: /\boccasion\b/i, weight: 0.5 },
      { re: /\b(style|styling)\b/i, weight: 0.5 },
    ],
  },
  {
    code: "COMPARISON",
    title: "Shortlisting and comparing options",
    definition:
      "Holding several candidates side by side — comparing items, brands, or platforms before committing to one.",
    prePurchase: true,
    leverage: 0.65,
    patterns: [
      { re: /\b(confused|torn|stuck|deciding)\s+between\b/i, weight: 1 },
      { re: /\bwhich\s+(one|of\s+these|is\s+better)\b/i, weight: 1 },
      { re: /\b(compare|comparing|comparison)\s+.{0,30}\b(price|option|brand|item|product|site|app)\b/i, weight: 1 },
      { re: /\bshortlist(ed|ing)?\b/i, weight: 1 },
      { re: /\b(myntra|ajio|nykaa|amazon|flipkart|meesho|shein|zara|h&m)\b.{0,25}\b(vs|versus|or)\b.{0,25}\b(myntra|ajio|nykaa|amazon|flipkart|meesho|shein|zara|h&m)\b/i, weight: 1 },
      { re: /\b(cheaper|better|same\s+thing)\s+on\s+(myntra|ajio|nykaa|amazon|flipkart|meesho)\b/i, weight: 1 },
      { re: /\b(a\s+or\s+b|option\s+[12ab])\b/i, weight: 1 },
      { re: /\bvs\b/i, weight: 0.5 },
      { re: /\balternative(s)?\b/i, weight: 0.5 },
    ],
  },
  {
    code: "SOCIAL_VALIDATION",
    title: "Wants someone else's opinion first",
    definition:
      "Explicitly asking another person — friends, a community, a partner — to weigh in before purchasing.",
    prePurchase: true,
    leverage: 0.8,
    patterns: [
      { re: /\bshould\s+i\s+(buy|get|order|keep|go\s+for)\b/i, weight: 1 },
      { re: /\b(what\s+do\s+you|wdyt|thoughts\?|opinions?\s+please|need\s+opinions?)\b/i, weight: 1 },
      { re: /\b(help|advice|suggestions?)\s+(me\s+)?(needed|please|pls|required)\b/i, weight: 1 },
      { re: /\b(rate|roast|judge)\s+(my|this)\s+(outfit|fit|pick|haul|cart)\b/i, weight: 1 },
      { re: /\basked?\s+(my|a)\s+(friend|sister|mom|partner|husband|wife|group)\b/i, weight: 1 },
      { re: /\bworth\s+(it|buying|the\s+money)\??/i, weight: 1 },
      { re: /\bsent\s+(it\s+)?to\s+(my|the)\s+(group|friends?)\b/i, weight: 1 },
      { re: /\bany(one|body)\s+(bought|tried|ordered)\b/i, weight: 1 },
      { re: /\brecommend(ation)?s?\b/i, weight: 0.5 },
      { re: /\bopinion\b/i, weight: 0.5 },
    ],
  },
  {
    code: "TRUST_QUALITY",
    title: "Doubts the quality or authenticity",
    definition:
      "Can't tell fabric, finish, or genuineness from the listing — suspects cheap material, a first copy, or a fake.",
    prePurchase: true,
    leverage: 0.8,
    patterns: [
      { re: /\b(fabric|material|cloth)\s+(quality|is\s+(cheap|bad|poor|thin|transparent|rough))\b/i, weight: 1 },
      { re: /\b(cheap|poor|bad|low|third\s*class)\s+(quality|material|fabric|stitching)\b/i, weight: 1 },
      { re: /\b(first\s+copy|duplicate|fake|not\s+original|replica|counterfeit)\b/i, weight: 1 },
      { re: /\b(is\s+it|are\s+they)\s+(genuine|authentic|original)\b/i, weight: 1 },
      { re: /\b(colou?r)\s+(is\s+)?(different|faded|bleed|not\s+as\s+shown)\b/i, weight: 1 },
      { re: /\bquality\s+(is\s+)?(not|poor|bad|worst|terrible|pathetic|cheap)\b/i, weight: 1 },
      { re: /\b(stitching|seam|thread)\s+(issue|problem|coming\s+out|open)\b/i, weight: 1 },
      { re: /\b(transparent|see[- ]through|thin)\s+(fabric|material|cloth)\b/i, weight: 1 },
      { re: /\bnot\s+worth\s+the\s+(price|money)\b/i, weight: 1 },
      { re: /\bquality\b/i, weight: 0.5 },
      { re: /\b(fabric|material)\b/i, weight: 0.5 },
    ],
  },
  {
    code: "BOOKMARKING",
    title: "Saving with no purchase intent",
    definition:
      "Using the wishlist as a scrapbook, mood board, or 'maybe later' list rather than a queue of intended purchases.",
    prePurchase: true,
    leverage: 0.3,
    patterns: [
      { re: /\bwishlist\s+(is|has|as)\s+.{0,20}(long|full|huge|graveyard|dump|list|mood\s*board)/i, weight: 1 },
      { re: /\b(never|rarely|hardly)\s+(actually\s+)?(buy|order|purchase)\s+.{0,20}(wishlist|saved|cart)/i, weight: 1 },
      { re: /\b(just|only)\s+(save|saving|add|adding|window)\s+.{0,15}(shopping|wishlist|later)/i, weight: 1 },
      { re: /\bwindow\s+shopping\b/i, weight: 1 },
      { re: /\b(save|saved|saving|add(ed)?)\s+(it\s+)?for\s+later\b/i, weight: 1 },
      { re: /\bmood\s*board\b/i, weight: 1 },
      { re: /\b(wishlist|saved\s+items?|save\s+list)\b/i, weight: 0.5 },
      { re: /\bcart\s+(is\s+)?(full|abandoned)\b/i, weight: 0.5 },
    ],
  },
  {
    code: "LOGISTICS_CX",
    title: "Delivery, returns & support (post-purchase)",
    definition:
      "Anything after the order is placed: delivery timing, courier handling, wrong or missing item, refunds, pickups, cancellations, support.",
    prePurchase: false,
    leverage: 0.2,
    patterns: [
      { re: /\b(deliver(y|ed|ing)?|courier|shipment|shipping|dispatch)\b/i, weight: 0.5 },
      { re: /\b(late|delay(ed)?|never\s+(arrived|came)|not\s+(delivered|received))\b/i, weight: 0.5 },
      { re: /\brefund(ed|s)?\b/i, weight: 1 },
      { re: /\breturn\s+(request|pickup|policy|process|window|not|never|denied|rejected)\b/i, weight: 1 },
      { re: /\b(pick\s*up|pickup)\s+(not|never|guy|agent|person|scheduled|cancel)/i, weight: 1 },
      { re: /\b(wrong|different|damaged|used|missing|empty)\s+(item|product|parcel|package|order)\b/i, weight: 1 },
      { re: /\b(customer\s+(care|support|service)|helpline|call\s+center|chat\s+support)\b/i, weight: 1 },
      { re: /\b(cancel(led|lation)?)\s+(my\s+)?(order|automatically)\b/i, weight: 1 },
      { re: /\b(cod|cash\s+on\s+delivery|prepaid)\b/i, weight: 1 },
      { re: /\b(exchange)\s+(request|not|never|denied|process)\b/i, weight: 1 },
      { re: /\b(app|application)\s+(crash|hang|slow|lag|freez|not\s+working|keeps\s+closing)/i, weight: 1 },
      { re: /\b(order|tracking|track)\s+(status|update|id|number)\b/i, weight: 1 },
      { re: /\b(money|amount)\s+(not\s+)?(refund|credit|deduct|debited|stuck)/i, weight: 1 },
      { re: /\breturn(ed|ing|s)?\b/i, weight: 0.5 },
      { re: /\b(order(ed|ing)?)\b/i, weight: 0.5 },
    ],
  },
];

export const DEDUCTIVE_OTHER: DeductiveLabel = {
  code: "OTHER",
  title: "No frame signal",
  definition:
    "Nothing in the text maps to the frame — generic praise, one-word noise, or a topic outside the wishlist question.",
  prePurchase: false,
  leverage: 0,
  patterns: [],
};

const ALL_LABELS: DeductiveLabel[] = [...DEDUCTIVE_LABELS, DEDUCTIVE_OTHER];

const BY_CODE = new Map<DeductiveCode, DeductiveLabel>(ALL_LABELS.map((l) => [l.code, l]));

export function deductiveLabel(code: DeductiveCode): DeductiveLabel {
  return BY_CODE.get(code) ?? DEDUCTIVE_OTHER;
}

export function isDeductiveCode(value: string): value is DeductiveCode {
  return BY_CODE.has(value as DeductiveCode);
}

export const PRE_PURCHASE_CODES: DeductiveCode[] = ALL_LABELS.filter((l) => l.prePurchase).map((l) => l.code);

export const LEVERAGE_BY_CODE: Record<string, number> = Object.fromEntries(ALL_LABELS.map((l) => [l.code, l.leverage]));

/** Per-label score for one text — exposed so /methodology can show a worked example. */
export function scoreLabels(text: string): Array<{ code: DeductiveCode; score: number; matched: string[] }> {
  if (!text) return [];
  return DEDUCTIVE_LABELS.map((label) => {
    if (label.vetoes?.some((re) => re.test(text))) return { code: label.code, score: 0, matched: [] };
    let score = 0;
    const matched: string[] = [];
    for (const { re, weight } of label.patterns) {
      if (re.test(text)) {
        score += weight;
        matched.push(re.source);
      }
    }
    return { code: label.code, score, matched };
  });
}

/**
 * Assign every deductive label whose matched weight reaches the threshold.
 * Always returns at least one code, so coverage is 100% by construction and
 * "unclassified" can never happen silently.
 */
export function classifyDeductive(text: string): DeductiveCode[] {
  const hits = scoreLabels(text)
    .filter((s) => s.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.code);
  return hits.length > 0 ? hits : ["OTHER"];
}

export const DEDUCTIVE_THRESHOLD = MATCH_THRESHOLD;
