# Discovery Engine

A Next.js app that collects reviews and discussion about a product from **all** configured sources at once — Play Store, App Store, YouTube, and community forums — in parallel, and uses **Groq** (a pinned, explicit model, not an auto-router) to discover and name specific themes grounded in what users actually said, instead of sorting reviews into a fixed category list.

This is a rebuild of an earlier Streamlit prototype (`../ai-discovery-engine/`), not a patch. It exists to fix two bugs found while testing that prototype live, and to add multi-source parallel collection plus data-driven theme discovery. See [What changed vs. the Streamlit prototype](#what-changed-vs-the-streamlit-prototype) below.

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

1. **Pass 1 — discover** (`lib/groq/themes.ts`): a diverse, stratified sample of up to 200 collected items (capped to stay well under Groq's free-tier 6,000 tokens/min limit) is sent to Groq once, with instructions to propose 8–14 *specific* candidate themes grounded in that sample, plus one mandatory catch-all (`OTH`, "Unrelated / other") for generic praise and noise. This is the extra LLM call the brief accepts paying for in exchange for names that are actually useful.
2. **Pass 2 — classify** (`lib/groq/classify.ts`): every item in the (capped) working set is batched 18-at-a-time and classified against the theme list from pass 1, returning a theme code, sentiment, and confidence per item. Both passes ask for strict JSON and validate the response; a parse or schema failure triggers exactly one retry with an explicit correction message before falling back (per batch) to `OTH` rather than losing the whole run.

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
2. **`OPENROUTER_MODEL=openrouter/free` randomly routing to a non-chat model** (a content-safety classifier landed once, breaking JSON parsing). This app uses **Groq** instead of OpenRouter's free auto-router, with `GROQ_MODEL` pinned explicitly (default `llama-3.3-70b-versatile`, set in `.env.local`) — there is no auto-routing step to land on the wrong kind of model.

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

Groq's free tier (at time of writing): 30 requests/min, 6,000 tokens/min, 14,400 requests/day. `lib/groq/client.ts` serializes every Groq call through a single queue with a ~2.1s floor between requests, which keeps a full discover run under the RPM cap without extra orchestration — but it also means classification time scales with the number of batches. Two env vars trade off thoroughness against request time and rate-limit headroom:

- `CLASSIFY_MAX_ITEMS` (default 200) — caps how many collected items pass through Groq classification per run, batched 18 at a time (~11 Groq calls ≈ 25-40s at the floor delay, plus the pass-1 discovery call). Raw scraped counts (the "items scraped" stat) are unaffected — only how many of them get a theme tag.
- `FORUM_MAX_ITEMS` (default 120) — caps forum collection volume, both for time and for the compliance reasons above.

Raise `CLASSIFY_MAX_ITEMS` if you have headroom (a paid Groq tier, or you're fine with a longer request) and want every collected item classified rather than a representative sample.

## What changed vs. the Streamlit prototype

| | `ai-discovery-engine/` (Streamlit) | `discovery-engine/` (this app) |
|---|---|---|
| Sources per run | One at a time, user-selected | All four, in parallel |
| Theme structure | Fixed JSON schema (pain points / feature requests / sentiment) | Themes discovered per-product from the data itself |
| LLM | OpenRouter, `openrouter/free` auto-router (could land on a non-chat model) | Groq, one pinned model, no auto-routing |
| Play Store search | Multi-word `search()` could match the wrong app silently | Exact-package resolution first; single-word fallback; resolved title always shown |
| Forums | Not a source | New: search-then-fetch over a configurable domain allowlist |
| Persistence | Streamlit session state | In-memory per request + `sessionStorage` cache client-side |

## Testing

`npm run build` and `npx tsc --noEmit` both pass. Pure logic (theme JSON parsing + retry-on-malformed-response, batched classification, BM25 ranking, the grounded-ask flow) was verified against a mocked Groq API. Live network calls to `itunes.apple.com`, Google Play's endpoints, YouTube, and Groq were not reachable from the sandbox this was built in (its outbound network is allowlisted to package registries only) — a live run against a real product (e.g. Nykaa Fashion, App Store ID `1439872423`, Play package `com.fsn.nds`) needs to happen either after deploying to Vercel or by running `npm run dev` locally with real API keys in `.env.local`.
