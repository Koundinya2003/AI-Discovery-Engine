# Discovery Engine

A Next.js app that collects reviews and discussion about a product from **all** configured sources at once — Play Store, App Store, YouTube, and community forums — in parallel, and uses **Groq** (a pinned, explicit model, not an auto-router) to discover and name specific themes grounded in what users actually said, instead of sorting reviews into a fixed category list.

This is a rebuild of an earlier Streamlit prototype, not a patch — the Streamlit app has been removed from this repo now that this version replaces it. It exists to fix two bugs found while testing that prototype live, and to add multi-source parallel collection plus data-driven theme discovery. See [What changed vs. the Streamlit prototype](#what-changed-vs-the-streamlit-prototype) below.

## Architecture

```
app/
  page.tsx              Client UI: search form, stat tiles, theme cards, Ask box
  api/discover/route.ts Orchestrates collection + two-pass theme discovery for one request
  api/ask/route.ts       BM25 retrieval + Groq for the "Ask the discovery engine" box
lib/
  collectors/
    app_store.ts         iTunes Search API (resolve) + public RSS reviews feed
    play_store.ts         google-play-scraper, with the multi-word search bug fixed
    youtube.ts            YouTube Data API v3: search.list + commentThreads.list
    forums.ts              search-then-fetch over a configurable domain allowlist
  groq/
    client.ts              Groq chat-completion client, rate-limited to the free tier
    themes.ts               Pass 1: discover themes from a sample of collected items
    classify.ts             Pass 2: classify every item against the discovered themes
    ask.ts                  Grounded Q&A over the classified corpus
  retrieval/bm25.ts        Keyword (BM25) ranking for the Ask box — no embeddings API
```

A single `POST /api/discover` request runs all four collectors with `Promise.allSettled` (one source failing never blocks the others), then runs the two Groq passes, and returns everything the UI needs — stats, discovered themes with representative quotes, and the classified corpus (cached client-side in `sessionStorage` so the Ask box doesn't need to re-collect).

There is no database. Each `/api/discover` call is synchronous and self-contained, tuned to fit inside a Vercel serverless function's time budget (see [Tuning & limits](#tuning--limits) below). A KV/Postgres layer for persisting past runs can be added later if needed.

## The two-pass theme discovery design

The brief for this project was explicit that generic buckets ("Pricing", "Bugs", "Customer Support") are the wrong output — a theme should read like `"Budget anchoring — delivery charges feel like a tax on small orders"`, not `"Pricing"`. A fixed taxonomy can't produce that, so this app uses two LLM passes instead of one:

1. **Pass 1 — discover** (`lib/groq/themes.ts`): a diverse, stratified sample of up to 80 collected items (near-empty items like "good"/"nice" filtered out first, then capped at 180 chars each — sized to fit the account's *actual* measured 8,000 TPM limit, see [Tuning & limits](#tuning--limits)) is sent to Groq once, with instructions to propose 8–14 *specific* candidate themes grounded in that sample, plus one mandatory catch-all (`OTH`, "Unrelated / other") for generic praise and noise. If the model still returns fewer than 4 specific themes, one bounded follow-up call pushes back with the count and asks it to look harder. This is the extra LLM call the brief accepts paying for in exchange for names that are actually useful.
2. **Pass 2 — classify** (`lib/groq/classify.ts`): every item in the (capped) working set is batched 10-at-a-time and classified against the theme list from pass 1, returning a theme code, sentiment, and confidence per item. Both passes ask for strict JSON and validate the response; a parse or schema failure triggers exactly one retry with an explicit correction message before falling back (per batch) to `OTH` rather than losing the whole run — except a 429 (rate limit), which skips that retry immediately instead of wasting a second call that's virtually guaranteed to also fail.

The `/api/discover` route then aggregates: count per theme, a relative-frequency bar (`count ÷ max(count)` across themes), and three representative quotes per theme — picked round-robin across sources so quotes aren't just the first three matches from whichever source happened to return the most items.

## Data sources & compliance

| Source | Method | Status |
|---|---|---|
| **App Store** | Free public RSS reviews feed + iTunes Search API to resolve an ID from a name | Fully compliant, official, free — no auth, no ToS issue. |
| **YouTube** | YouTube Data API v3 (`search.list` + `commentThreads.list`) | Fully compliant, official, free daily quota (10,000 units/day). |
| **Play Store** | [`google-play-scraper`](https://www.npmjs.com/package/google-play-scraper) hitting Google's public but undocumented endpoints | **Unofficial / gray-zone under Google's ToS.** Not an API Google publishes for this. Per-run volume is capped (`MAX_REVIEWS = 300` in `lib/collectors/play_store.ts`) to keep usage modest. |
| **Forums** | Search-then-fetch: a web search scoped to `site:` a small allowlist of community domains (default `onlytechforum.in`, `pissedconsumer.com`, `quora.com`), then fetch and extract text from the pages that search already returned as public results | Same spirit as Play Store: no official API for this, so this fetches public pages surfaced by search rather than scraping a forum directly. Volume is capped (`FORUM_MAX_ITEMS`, default 120). Configure the domain list and search provider via env vars. |

**Reddit is deliberately excluded.** Its official API now requires a multi-week developer approval process, and unofficial scraping breaches Reddit's ToS outright — not worth building against for this project.

If you extend the forum domain allowlist, apply the same standard: only add domains you're comfortable fetching public pages from at modest volume, and keep the compliance note in this README accurate.

## Fixing the two bugs from the Streamlit prototype

1. **Play Store multi-word search returning the wrong app** (e.g. searching "Nykaa Fashion" returned Myntra). `lib/collectors/play_store.ts` no longer trusts a bare `search()` call on a multi-word query as the primary path:
   - If an exact package name is supplied (or already known), it's resolved directly with `app()` — no search, no ambiguity.
   - The `search()` fallback, when it's needed at all, uses only the single most brand-distinctive word from the product name (the first word that isn't a generic filler like "app"/"store"/"fashion"-as-suffix — not the longest word, and not the full multi-word string, which is what produced the wrong match originally).
   - The resolved app's title is always returned in the API response and shown in the UI ("Resolved matches: Play Store — …"), so a bad match is visible immediately instead of silently poisoning the review set.
2. **`OPENROUTER_MODEL=openrouter/free` randomly routing to a non-chat model** (a content-safety classifier landed once, breaking JSON parsing). This app uses **Groq** instead of OpenRouter's free auto-router, with `GROQ_MODEL` pinned explicitly (default `openai/gpt-oss-120b`, set in `.env.local`) — there is no auto-routing step to land on the wrong kind of model.

## Setup

1. `npm install`
2. `cp .env.local.example .env.local` and fill in:
   - `GROQ_API_KEY` — required. Free key at [console.groq.com](https://console.groq.com/keys).
   - `YOUTUBE_API_KEY` — optional; without it the YouTube collector is skipped and the rest of the run still works.
   - A search provider for the forum collector — optional; without one configured, the forum collector is skipped. Pick one:
     - `SEARCH_PROVIDER=google_cse` (default) + `GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_CX` — [Google Custom Search JSON API](https://programmablesearchengine.google.com/), 100 free queries/day.
     - `SEARCH_PROVIDER=bing` + `BING_SEARCH_API_KEY`
     - `SERPAPI_API_KEY` + `SEARCH_PROVIDER=serpapi`
3. `npm run dev` and open [http://localhost:3000](http://localhost:3000).

Enter a product/app name and (optionally) its exact App Store ID and/or Play Store package if you know them — supplying these skips ambiguous search entirely for that source.

### Deploying to Vercel

This app has no server-side state beyond the request lifecycle, so it deploys as-is to Vercel's free (Hobby) tier:

1. Push this repo to GitHub and import it in the [Vercel dashboard](https://vercel.com/new), or run `vercel` from this directory.
2. Add the same environment variables from `.env.local` under Project Settings → Environment Variables.
3. Deploy. `app/api/discover/route.ts` declares `export const maxDuration = 60`, which Vercel Hobby honors for Node.js serverless functions.

## Tuning & limits

Groq's docs advertise 30 requests/min and 6,000 tokens/min (TPM) on the free tier, but the *actual* enforced limit — confirmed live via this account's `x-ratelimit-limit-tokens` response header, not the docs — is **8,000 TPM** for `openai/gpt-oss-120b` (the pinned `GROQ_MODEL`). That model is also a reasoning model: `usage.completion_tokens_details.reasoning_tokens` shows it silently spends 600–1,300 tokens per call on hidden chain-of-thought before it ever writes the JSON answer, which eats into that same 8,000 budget. Every other chat-capable model currently on this account's Groq access (`openai/gpt-oss-20b`, `openai/gpt-oss-safeguard-20b`, `qwen/qwen3.6-27b`) has the same reasoning-token tax; `groq/compound(-mini)` avoids it but is an agentic wrapper that internally re-invokes other pinned models (each with their own, sometimes tighter, TPM budget) rather than answering directly, which makes it slower and no more reliable for a plain classification call. `llama-3.1-8b-instant` and `llama-3.3-70b-versatile`, this project's original non-reasoning picks, have since been retired from this account's model list entirely (`404 model_not_found`).

`lib/groq/client.ts` serializes every Groq call through a single queue with a ~2.1s floor between requests — enough to stay under the 30 RPM cap — but RPM was never the bottleneck: TPM is. The pass-1 theme-discovery call alone (`lib/groq/themes.ts`, sample capped at 80 items / 180 chars each) uses ~4,200 of the 8,000-token budget by itself, live-measured. Two env vars trade off thoroughness against that reality:

- `CLASSIFY_MAX_ITEMS` (default **36** — a handful of 10-item batches) — caps how many collected items pass through Groq classification per run. This used to default to 200 at 18-item batches, sized against the *documented* 6,000 TPM figure; against the *real* 8,000 TPM cap and the reasoning-token tax, that meant most batches got `429`'d and silently fell back to `OTH`, burying real themes under a huge fake "Unrelated/other" count — and even a batch that fit inside the TPM budget could still get cut off mid-JSON, because the reasoning tax plus 18 items' worth of output didn't reliably fit the old 1,500-token completion budget. 36 items at 10/batch (2,000-token completion budget per call) is what this account can actually get real, complete theme codes for in one request. Raw scraped counts (the "items scraped" stat) are unaffected — only how many of them get a theme tag.
- `FORUM_MAX_ITEMS` (default 120) — caps forum collection volume, both for time and for the compliance reasons above.

Raise `CLASSIFY_MAX_ITEMS` only if you have real TPM headroom (Groq Dev Tier, or a non-reasoning model becomes available again on your account) — raising it against this account's actual free-tier limits just moves the failure point later without fixing it.

## What changed vs. the Streamlit prototype

| | `ai-discovery-engine/` (Streamlit) | `discovery-engine/` (this app) |
|---|---|---|
| Sources per run | One at a time, user-selected | All four, in parallel |
| Theme structure | Fixed JSON schema (pain points / feature requests / sentiment) | Themes discovered per-product from the data itself |
| LLM | OpenRouter, `openrouter/free` auto-router (could land on a non-chat model) | Groq, one pinned model, no auto-routing |
| Play Store search | Multi-word `search()` could match the wrong app silently | Exact-package resolution first; single-word fallback; resolved title always shown |
| Forums | Not a source | New: search-then-fetch over a configurable domain allowlist |
| Persistence | Streamlit session state | In-memory per request + `sessionStorage` cache client-side |

## Production hardening

- **Theme-discovery yield.** A live run can come back from Groq with far fewer than the requested 8–14 specific themes if the sample happens to be dominated by short, low-signal reviews ("good", "nice") — in one observed run, 199 of 200 classified items landed in the `OTH` catch-all with only one real theme discovered. `lib/groq/themes.ts` now (1) filters near-empty items out of the pass-1 sample before asking the model to find patterns in it, and (2) if the first pass still returns fewer than 4 specific themes, issues one bounded follow-up call with an explicit correction ("you only found N, look harder"), keeping whichever result has more real themes.
- **Rate limiting & caching.** `/api/discover` and `/api/ask` are rate-limited per client IP (defaults: 5 discover requests / 10 min, 20 ask requests / 10 min — tune via `DISCOVER_RATE_LIMIT` / `ASK_RATE_LIMIT`), and successful discover results are cached for `DISCOVER_CACHE_TTL_SECONDS` (default 1 hour) so repeat searches for the same product don't re-burn Groq/YouTube/Google-CSE quota. Both are backed by [Upstash Redis](https://console.upstash.com/) (REST-based, free tier) via `lib/redis.ts` — without `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` configured, both features are no-ops and the app behaves exactly as it did before they existed.
- **Network hardening.** Every outbound call (iTunes, Play Store, YouTube, forum search + page fetch) now has a bounded timeout and one retry on transient failure (`lib/http.ts`), so a single hung external endpoint can't stall a request until Vercel's `maxDuration` kills the whole function.
- **Accurate warnings.** A source with zero items now distinguishes *"skipped because its API key isn't configured"* from *"ran and genuinely found nothing"* — previously both produced the same "returned zero items" message.
- **Structured logging.** `lib/logger.ts` emits single-line JSON to stdout/stderr for every collector run, Groq call, cache hit/miss, and rate-limit rejection — visible in Vercel's log viewer with no external service.
- **Input validation.** `productName` (`/api/discover`) and `question`/`corpus` (`/api/ask`) are length-capped and rejected with `400` beyond that, bounding prompt sizes and guarding against a client bypassing the normal discover→ask flow with an oversized payload.
- **Rate-limit fast-fail.** A 429 from Groq used to still trigger the client's one JSON-correction retry — pointless for a rate-limit error, and that retry call was itself virtually guaranteed to also 429, wasting both TPM budget and wall-clock time. `callGroqJsonWithRetry` now recognizes `GroqRateLimitError` and skips straight to the caller's own fallback instead.
- **Hydration mismatch on repeat visits.** `app/page.tsx` used to read `sessionStorage` inside a `useState` lazy initializer, which runs during the client's first render — so a returning visitor (same tab, cached result) hydrated a `<Header>` against server HTML that always rendered the empty-search placeholder, throwing a hydration error on every load. State now starts `null` on both server and client and the cached result is restored in a `useEffect` (client-only, post-hydration) instead.

## Testing

Run `npm test` (vitest) for the unit suite covering the pure-logic pieces: theme JSON validation and the low-yield retry path (`lib/groq/themes.test.ts`), batched classification validation (`lib/groq/classify.test.ts`), BM25 ranking (`lib/retrieval/bm25.test.ts`), the Play Store brand-word resolver (`lib/collectors/play_store.test.ts`), and the Groq client's JSON-fence stripping + retry-on-malformed-response behavior (`lib/groq/client.test.ts`) — all against a mocked Groq API, no live network needed. `.github/workflows/ci.yml` runs `lint`, `tsc --noEmit`, and `npm test` on every push/PR.

`npm run build` and `npx tsc --noEmit` also both pass. Live network calls to `itunes.apple.com`, Google Play's endpoints, YouTube, and Groq still need either a Vercel deployment or `npm run dev` locally with real API keys in `.env.local` — a live run against a real product (e.g. Nykaa Fashion, App Store ID `1439872423`, Play package `com.fsn.nds`) isn't covered by the unit suite.
