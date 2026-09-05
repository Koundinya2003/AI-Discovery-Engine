# Discovery Engine

Ranks **opportunity areas** for online fashion shopping from public conversation, with the sampling, taxonomies and scoring all published so a number in a slide can be traced back to the string that produced it.

Built against one business goal: **increase the share of users who purchase at least one wishlisted item within 30 days of saving it**, with monetary incentives out of scope.

## What a run produces

| Output | What it answers |
|---|---|
| **Coverage panel** | How many items were scraped, how many were duplicates, how many were classified, and by what rule the model layer was sampled |
| **Opportunity table** (ranked, two taxonomies) | Which hesitation is most common, most severe, most widespread — and most *relevant to this goal* |
| **Segment cuts** | How that differs by platform, rating band, recency and inferred shopper type |
| **Channel coverage** | What each source structurally can and cannot reveal, with live per-channel evidence |
| **Grounded Q&A** | Answers strictly from the corpus, and a refusal when the corpus is silent |
| **Exports & permalink** | CSV / JSON / markdown tables, and `/run/{id}` for linking a specific result |

## Architecture, in six steps

```
1. COLLECT   Play Store · App Store · Reddit · YouTube, every platform in parallel
             (each app match verified by title, or the source collects nothing)
2. PREPARE   Exact-duplicate removal on normalised text; every removal counted
3. LABEL     Deductive frame applied by published rules to 100% of the corpus — no model
4. SAMPLE    Deterministic stratified draw (source × platform × rating band) for the model layer
5. INDUCE    Model discovers themes from that sample and classifies that same sample
6. SCORE     Opportunity = 100 × Leverage × (0.50·Prevalence + 0.30·Severity + 0.20·Breadth)
```

Steps 1–4 and 6 need no LLM. If Groq is unavailable, step 5 is skipped and the run still produces a complete, 100%-coverage analysis — the model is an enhancement, not a dependency.

## The two taxonomies, and why both

**Deductive frame — 100% coverage, deterministic.** Ten labels derived from the brief, applied by weighted pattern rules:

`FIT_SIZE` · `FIT_EVIDENCE` · `PRICE_WAIT` · `STYLING_OCCASION` · `COMPARISON` · `SOCIAL_VALIDATION` · `TRUST_QUALITY` · `BOOKMARKING` · `LOGISTICS_CX` · `OTHER`

Multi-label: *"wrong size delivered, return pickup never came"* is genuinely both `FIT_SIZE` and `LOGISTICS_CX`, and forcing a single winner is how a fit signal disappears under logistics volume. Every pattern is printed on `/methodology`.

Why rules rather than the model for this layer: a free-tier token budget caps model labelling at a few dozen items per run. A brief that asks to *"quantify and compare opportunity areas"* needs a denominator covering every item, not 6% of them.

**Inductive themes — sampled, model-generated.** Groq proposes themes from the data and classifies the sample. Its shares are reported against *the number of items it actually classified*, never against the full corpus.

The two are cross-checked: the classifier returns its own frame labels alongside its theme, and the run reports the **rule–model agreement rate** rather than assuming the rules are right.

## The opportunity score

```
Opportunity = 100 × Leverage × (0.50·Prevalence + 0.30·Severity + 0.20·Breadth)
```

- **Prevalence** — share of corpus, normalised to the largest theme.
- **Severity** — share of the theme's rated items at 1–2★ (falls back to model sentiment, then to the corpus detractor rate as a neutral prior).
- **Breadth** — distinct platforms carrying it ÷ platforms in the run. A theme on all three is a category problem; one on a single app may be a local defect.
- **Leverage** — how directly the theme sits between *saved* and *bought*, 0–1, fixed and published per label.

**Leverage multiplies rather than adds, deliberately.** An additive score lets a theme accumulate rank from volume alone — and post-delivery logistics dominates review volume because a review form is where you go *after* a delivery. Multiplying says the honest thing: a large problem with little to do with the goal is not a large opportunity *for this goal*. The inductive catch-all is pinned to zero leverage so it can never head a ranking.

Every component is a column in the table next to the score, so a reader can disagree with a weight instead of with the conclusion.

## Data sources & compliance

| Source | Method | Status |
|---|---|---|
| **App Store** | iTunes Search API to resolve the app + public customer-reviews RSS feed | Official, public, unauthenticated. |
| **Reddit** | Public `search.json` endpoints per subreddit, `restrict_sr=1` | Public JSON, no auth, no quota registration. Volume capped (`REDDIT_MAX_ITEMS`, default 200), requests bounded and pooled, descriptive User-Agent, a 429 surfaced as a rate-limited state rather than retried hard. No author handles stored. |
| **Play Store** | [`google-play-scraper`](https://www.npmjs.com/package/google-play-scraper) against Google's public but undocumented endpoints | **Unofficial / ToS grey area.** Not an API Google publishes for this. Per-run volume capped at 300 reviews per platform. |
| **YouTube** | Data API v3 (`search.list` + `commentThreads.list`) | Official, free daily quota. Optional. |

Reddit was previously excluded from this project on API-access grounds. That was the right call for the *authenticated* API, which does require developer approval — but it was the wrong conclusion for the public JSON endpoints, which need no auth and are the same data the public HTML page renders. Reddit is the only channel here that reaches people *before* they buy, so excluding it removed the only source that could answer the brief.

**The Google CSE forum collector was removed.** It needed two API keys, burned a 100/day quota, and returned zero items for every domain in practice — a CSE scoped to a fixed site list ignores the per-query `site:` operator the collector was adding. Reddit replaces it with no keys at all.

## Honest framing of the null result

App-store reviews are a **post-delivery** channel. The person writing one has already transacted; the user this brief is about — who saved something and never bought it — leaves no trace there. The Channel Coverage panel states this per source and prints the measured share of each channel's items carrying any pre-purchase signal, so the claim is testable rather than asserted, and the grounded Q&A box will say *"the excerpts don't cover this"* rather than manufacture an answer.

That is a finding about where the evidence lives, and it is the reason the comparison corpus and the Reddit channel exist.

## No leaked internals

A source that fails produces a *category* (`not_configured`, `blocked`, `rate_limited`, `timeout`, `network`, `no_results`, `no_confident_match`, `upstream_error`) plus fixed, human-readable copy. Raw exception text, upstream URLs, HTTP statuses and environment-variable names go to the server log only. Everything user-facing additionally passes a scrub that redacts `SCREAMING_SNAKE` tokens, URLs and long opaque strings, so a future edit cannot reintroduce a leak.

## Setup

```bash
npm install
cp .env.local.example .env.local   # every value is optional; see the comments
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), enter a primary platform (e.g. *Nykaa Fashion*) and pick comparison platforms.

### Deploying to Vercel

1. Import the repo in the [Vercel dashboard](https://vercel.com/new) with **Root Directory = `discovery-engine`**.
2. Add the environment variables you want under Project Settings → Environment Variables.
3. Deploy. `app/api/discover/route.ts` declares `export const maxDuration = 60`.

**Deep links work natively.** `/run/{id}` and `/methodology` are real App Router routes rendered on the server — a catch-all SPA rewrite in `vercel.json` would break them *and* the API routes, so `vercel.json` deliberately contains only the framework declaration.

## Tuning & limits

Groq's docs advertise 6,000 TPM on the free tier; the *enforced* limit for the pinned `openai/gpt-oss-120b`, confirmed live via `x-ratelimit-limit-tokens`, is **8,000 TPM**. It is also a reasoning model, spending 600–1,300 tokens per call on hidden chain-of-thought before writing any JSON, and pass-1 theme discovery alone uses ~4,200 of that budget.

`CLASSIFY_MAX_ITEMS` (default **48**) is the only knob that limits coverage, and only for the inductive layer. Raise it only with real TPM headroom. The important change from earlier versions: **items the model fails to return a tag for are reported as _unclassified_, not relabelled into the catch-all** — so a large `OTH` bar now means "the model looked and found nothing specific", not "the request was rate-limited".

`REDDIT_MAX_ITEMS` (default 120→200) caps community volume for time and compliance.

## Testing

`npm test` runs 171 unit tests with no network:

| Area | Covers |
|---|---|
| `lib/taxonomy/deductive.test.ts` | Every label fires on real phrasing; 100%-coverage guarantee; multi-label; threshold behaviour |
| `lib/sampling.test.ts` | Largest-remainder allocation, the one-per-stratum floor, determinism, order-independence |
| `lib/analysis/opportunity.test.ts` | Score recomputes to the published formula; a smaller high-leverage theme outranks a larger post-purchase one; catch-all pinned to zero |
| `lib/analysis/segments.test.ts` | Every cut, un-inferable shopper types, empty-corpus safety |
| `lib/pipeline.test.ts` | Full collect→score run against mocked collectors: coverage identities, degraded paths, streamed counts, leak assertions |
| `lib/errors.test.ts` | No reason copy contains an env-var name; scrub redacts URLs, tokens, `SCREAMING_SNAKE` |
| `lib/collectors/reddit.test.ts` | URL shape, query terms, topical filter, platform attribution, malformed payloads |
| `lib/export.test.ts`, `lib/corpus.test.ts`, `lib/platforms.test.ts`, `lib/groq/*` | CSV escaping, dedupe identities, match verification, prompt and JSON-validation behaviour |

`npm run lint`, `npx next typegen && npx tsc --noEmit` and `npm run build` all pass; CI runs them on every push.

## Author

**Aditya K. Koundinya** — [GitHub](https://github.com/Koundinya2003) · [LinkedIn](https://www.linkedin.com/in/adityakkoundinya/)
