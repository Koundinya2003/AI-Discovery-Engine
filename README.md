<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/01_hero_dark.svg">
  <img src="docs/readme/01_hero_light.svg" width="100%" alt="Discovery Engine, an opportunity ranking instrument built with Next.js. It ranks what stops fashion shoppers from buying, straight from public conversation, with every rule printed on screen, and labels 100% of the corpus by rule. The one goal it is built against: increase the share of users who buy at least one wishlisted item within 30 days of saving it, with monetary incentives out of scope. It compares Nykaa Fashion, Myntra and AJIO. A reel of phrasings from the test suite passes a label line and gets tagged, for example 'this brand runs small, order one size up' as FIT_SIZE, 'I keep it in my wishlist and wait for the sale before buying' as PRICE_WAIT, 'Confused between these two kurtas, which one is better?' as COMPARISON, 'Should I buy this? Need opinions please' as SOCIAL_VALIDATION and 'Cheap quality fabric, feels like a first copy' as TRUST_QUALITY.">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/02_pipeline_dark.svg">
  <img src="docs/readme/02_pipeline_light.svg" width="100%" alt="Scrape, label, sample, induce, score. Sources: Play Store, App Store, Reddit, YouTube. Step 1 collect: all four sources, every platform in parallel, and an app match is verified by title or the source collects nothing. Step 2 prepare: exact duplicates removed on normalised text, every removal counted. Step 3 label: the deductive frame applied by published rules to 100% of the corpus. Step 4 sample: a deterministic stratified draw by source, platform and rating band. Step 5 induce: Groq proposes themes from the sample and classifies that same sample; this is the only step that uses an LLM, and it is optional. Step 6 score: a transparent opportunity formula with every component as a column. 5 of 6 steps run without a model: if Groq is unavailable, step 5 is skipped and the run still returns a complete analysis with 100% coverage. The model is an enhancement, not a dependency.">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/03_taxonomy_dark.svg">
  <img src="docs/readme/03_taxonomy_light.svg" width="100%" alt="Ten labels, each with a leverage: how directly a hesitation sits between saved and bought, fixed and published per label from 0 to 1. FIT_SIZE, fit and size uncertainty, 1.00. FIT_EVIDENCE, wants proof on a real body, 0.95. SOCIAL_VALIDATION, wants someone's opinion first, 0.80. TRUST_QUALITY, doubts quality or authenticity, 0.80. STYLING_OCCASION, unsure how or where to wear it, 0.70. COMPARISON, shortlisting and comparing, 0.65. PRICE_WAIT, waiting for a price drop, 0.45. BOOKMARKING, saving with no intent to buy, 0.30. LOGISTICS_CX, delivery, returns and support after purchase, 0.20. OTHER, no frame signal, 0. The deductive frame uses rules for 100% coverage because a free tier token budget caps model labelling at a few dozen items per run, and quantifying opportunity needs a denominator covering every item, not 6% of them. Labels are multi label on purpose: 'wrong size delivered, return pickup never came' is both FIT_SIZE and LOGISTICS_CX. Inductive themes come from the model on the stratified sample, with shares reported against items it actually classified and a printed rule and model agreement rate.">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/04_score_dark.svg">
  <img src="docs/readme/04_score_light.svg" width="100%" alt="Volume alone cannot win. Opportunity equals 100 times Leverage times (0.50 Prevalence plus 0.30 Severity plus 0.20 Breadth). Prevalence, weight 0.50: share of the corpus, normalised to the largest theme. Severity, weight 0.30: share of rated items at 1 or 2 stars, with published fallbacks when ratings are thin. Breadth, weight 0.20: platforms carrying the theme divided by platforms in the run; all three means a category problem. Leverage multiplies: 0 to 1 per label, and the inductive catch all is pinned to 0. Worked illustration with made up inputs, not run data: an after delivery theme with problem size 0.90 and a fit theme with 0.40; after multiplying by leverage 0.20 and 1.0 they score 18 and 40, so the smaller, goal relevant theme ranks first. A test checks exactly this.">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/05_sources_dark.svg">
  <img src="docs/readme/05_sources_light.svg" width="100%" alt="Four channels, honestly labelled. App Store: iTunes Search API plus the public reviews RSS feed; official and public; sees shoppers after delivery. Reddit: public search.json per subreddit with no auth, capped at 200 by default, no author handles stored; public JSON with no key; sees shoppers before buying. Play Store: google play scraper on public but undocumented endpoints, capped at 300 reviews per platform; unofficial and a terms of service grey area; sees shoppers after delivery. YouTube: Data API v3, search plus comment threads, free daily quota; official and optional. The shopper who saved something and never bought it leaves no trace in an app store review, so the Channel Coverage panel prints each channel's measured share of items with a pre purchase signal, and the grounded Q and A box says the excerpts don't cover this instead of inventing an answer. No leaked internals: a failing source shows only a category (not_configured, blocked, rate_limited, timeout, network, no_results, no_confident_match, upstream_error); raw errors, upstream URLs, HTTP statuses and variable names go to the server log only.">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/06_stack_dark.svg">
  <img src="docs/readme/06_stack_light.svg" width="100%" alt="Runs with zero keys: with no API keys a run still collects, labels 100%, scores opportunities and cuts segments; a Groq key adds themes and grounded Q and A, and Upstash adds permalinks. Stack: Next.js 16 with the App Router and server rendered run and methodology pages; TypeScript and Tailwind CSS with typegen checked in CI; Groq with openai/gpt-oss-120b pinned, never auto routed; Upstash Redis for rate limits, result cache and run permalinks; Vitest unit tests with no network; Vercel with root directory discovery-engine and a 60 second max duration. Numbers: 171 unit tests, all offline; 8,000 tokens per minute, the enforced Groq limit (docs say 6,000); 48 items in the default model sample, the only coverage knob; 6 outputs: coverage, ranking, segments, channels, Q and A, exports. Built by Aditya K. Koundinya.">
</picture>

# Discovery Engine

> Ranks opportunity areas for online fashion shopping from public conversation, with the sampling rule, both taxonomies and the scoring formula printed on screen, so every number can be traced back to the rule that produced it.

A Next.js app built against one business goal: **increase the share of users who purchase at least one wishlisted item within 30 days of saving it**, with monetary incentives out of scope.

It collects public conversation from Play Store, App Store, Reddit and YouTube across **several fashion platforms at once** (Nykaa Fashion, Myntra, AJIO), labels **100% of it** against a fixed frame using published rules, induces additional themes from a **stated stratified sample**, and ranks the result with a transparent opportunity score.

**GitHub:** https://github.com/Koundinya2003/AI-Discovery-Engine

## The app lives in [`discovery-engine/`](discovery-engine/)

That directory's [README](discovery-engine/README.md) is the source of truth for:

* The six step scrape, label, sample, induce, score architecture
* Both taxonomies and why the deductive layer uses rules rather than the model
* The opportunity formula and why leverage multiplies instead of adding
* All four data sources and their compliance notes
* Setup, environment variables, and deploying to Vercel

The deployed app also serves its own **`/methodology`** page, generated from the same constants the pipeline runs on: sources, query terms, dedupe, sampling, every classification pattern, every prompt, limitations and known biases.

## Quick start

```bash
cd discovery-engine
npm install
cp .env.local.example .env.local   # every value is optional
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), enter a primary platform (for example "Nykaa Fashion") and pick comparison platforms.

With no API keys at all, a run still collects, labels 100% of the corpus, scores opportunities and cuts segments. A Groq key adds inductive theme discovery and the grounded Q&A box; an Upstash Redis URL adds `/run/{id}` permalinks.

Environment variables (all optional, documented in `discovery-engine/.env.local.example`): `GROQ_API_KEY`, `GROQ_MODEL`, `REDDIT_SUBREDDITS`, `REDDIT_MAX_ITEMS`, `YOUTUBE_API_KEY`, `CLASSIFY_MAX_ITEMS`, `SAMPLE_SEED`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `DISCOVER_RATE_LIMIT`, `ASK_RATE_LIMIT`, `DISCOVER_CACHE_TTL_SECONDS`, `RUN_TTL_SECONDS`.

## Tech stack

* Next.js 16 (App Router)
* TypeScript
* Tailwind CSS
* Groq (`openai/gpt-oss-120b`, pinned)
* Upstash Redis (rate limiting, caching, run permalinks)
* Vitest (171 tests, no network)
* Deployed on Vercel

## Rebuilding the panels

The images at the top are SVG panels generated from one HTML page. Edit `docs/readme/one_sheet.html`, then run:

```bash
node docs/readme/build_readme_svgs.js docs/readme/one_sheet.html docs/readme 960
```

This needs Node with Playwright installed, and curl (fonts are fetched from Google Fonts and embedded).

## Author

**Aditya K. Koundinya**

* GitHub: https://github.com/Koundinya2003
* LinkedIn: https://www.linkedin.com/in/adityakkoundinya/

If you found this project useful, consider giving it a star!
