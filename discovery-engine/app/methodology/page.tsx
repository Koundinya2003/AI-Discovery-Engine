import Link from "next/link";
import type { Metadata } from "next";
import { DEDUCTIVE_LABELS, DEDUCTIVE_OTHER, DEDUCTIVE_THRESHOLD } from "@/lib/taxonomy/deductive";
import { SCORING_COMPONENT_NOTES, SCORING_FORMULA } from "@/lib/analysis/opportunity";
import { REDDIT_DEFAULT_SUBREDDITS, REDDIT_QUERY_GROUPS, REDDIT_TOPICAL_FILTER } from "@/lib/collectors/reddit";
import { THEME_SYSTEM_PROMPT } from "@/lib/groq/themes";
import { buildClassifySystemPrompt } from "@/lib/groq/classify";
import { ASK_SYSTEM_PROMPT } from "@/lib/groq/ask";
import { CHANNEL_CLAIMS, CHANNEL_LABELS } from "@/lib/analysis/channels";
import { SHOPPER_TYPE_LABELS } from "@/lib/corpus";

export const metadata: Metadata = {
  title: "Methodology — Discovery Engine",
  description: "Sources, query terms, dedupe, sampling, taxonomies, prompts, scoring, limitations and known biases.",
};

// Rendered from the same constants the pipeline runs on, so this page cannot
// describe a method the code no longer follows. The one prompt shown with a
// placeholder theme list is the classifier's, whose theme block is filled in
// per run from whatever pass 1 discovered.
const EXAMPLE_CLASSIFY_PROMPT = buildClassifySystemPrompt([
  { code: "XXXX", title: "…themes discovered from this run's sample…", definition: "…filled in at run time…" },
]);

export default function MethodologyPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-4 py-10 sm:px-6">
      <div>
        <Link href="/" className="text-xs text-de-accent underline underline-offset-2">
          ← Back to the engine
        </Link>
        <h1 className="mt-3 text-2xl sm:text-3xl font-bold text-de-text-primary">Methodology</h1>
        <p className="mt-2 text-sm text-de-text-secondary">
          Everything below is generated from the constants the pipeline actually runs on. If a rule changes in the code,
          this page changes with it.
        </p>
      </div>

      <Section title="1. Research question">
        <P>
          The business goal is to increase the share of users who buy at least one wishlisted item within 30 days of
          saving it. Monetary incentives are out of scope, so the analysis looks for the non-price reasons a saved item
          stays saved: uncertainty about fit, missing evidence of how something looks worn, doubts about quality, and
          the need for someone else&rsquo;s opinion.
        </P>
        <P>
          Two questions follow, and the pipeline answers them separately: <em>which hesitation is most common and most
          consequential</em> (the opportunity table) and <em>how that differs by platform and shopper</em> (the segment
          cuts).
        </P>
      </Section>

      <Section title="2. Sources and what is collected">
        <Table
          head={["Channel", "Method", "Access", "Rated / dated"]}
          rows={[
            ["Play Store reviews", "google-play-scraper against Google's public endpoints, ≤300 reviews per platform, country IN", "Unofficial library, ToS grey area — volume kept modest", "Yes / yes"],
            ["App Store reviews", "iTunes Search API to resolve the app, then the public customer-reviews RSS feed, ≤6 pages per platform, country IN", "Official, public, unauthenticated", "Yes / yes"],
            ["Reddit", "Public search.json endpoints per subreddit, restrict_sr=1, limit 100", "Public JSON, no auth, no quota registration", "No / yes"],
            ["YouTube", "Data API v3 search.list + commentThreads.list", "Official API, optional — skipped cleanly when unconfigured", "No / yes"],
          ]}
        />
        <P>
          An app is only accepted when its resolved title contains a token expected for that platform. A numeric ID or
          package that resolves to a different app is rejected as &ldquo;no confident match&rdquo; and that source
          collects nothing, rather than filling the corpus with a competitor&rsquo;s reviews.
        </P>
      </Section>

      <Section title="3. Reddit query terms">
        <P>Subreddits searched by default:</P>
        <Code>{REDDIT_DEFAULT_SUBREDDITS.map((s) => `r/${s}`).join("  ·  ")}</Code>
        <P>Three boolean query groups are run against each, so ~20 terms cost 3 requests per subreddit:</P>
        {REDDIT_QUERY_GROUPS.map((g) => (
          <Code key={g.id}>
            {g.id}: {g.q}
          </Code>
        ))}
        <P>
          Posts must then match a topical filter to enter the corpus — this is what keeps a large general subreddit from
          contributing off-topic volume. Items rejected by it are counted and reported on the source panel, never
          dropped silently:
        </P>
        <Code>{REDDIT_TOPICAL_FILTER}</Code>
      </Section>

      <Section title="4. De-duplication">
        <P>
          Text is lowercased, URLs and punctuation are stripped, whitespace is collapsed, and exact matches on that
          normalised form are removed, as are items under 3 characters. De-duplication is deliberately exact rather than
          fuzzy: near-duplicate clustering would start deleting genuinely distinct reviews that share phrasing, and
          every removal changes a denominator that ends up in a slide. The count removed is reported on every run.
        </P>
      </Section>

      <Section title="5. Two taxonomies, two coverage levels">
        <P>
          <strong className="text-de-text-primary">Deductive frame — 100% coverage, no model.</strong> Every analysed
          item is scored against the labels below by weighted pattern rules. A label applies when its matched weights
          reach {DEDUCTIVE_THRESHOLD.toFixed(1)}. Labels are multi-label: &ldquo;wrong size delivered, return pickup
          never came&rdquo; is genuinely both a fit problem and a logistics problem, and forcing one winner is how a fit
          signal disappears underneath logistics volume. An item matching nothing is labelled{" "}
          <code className="text-de-accent">OTHER</code>, so coverage is 100% by construction.
        </P>
        <P>
          <strong className="text-de-text-primary">Inductive themes — sampled, model-generated.</strong> A language
          model proposes themes from a stratified sample and classifies that same sample. Its shares are reported
          against the number of items it actually classified, never against the full corpus.
        </P>

        <Table
          head={["Code", "Label", "Pre-purchase?", "Leverage", "Definition"]}
          rows={[...DEDUCTIVE_LABELS, DEDUCTIVE_OTHER].map((l) => [
            l.code,
            l.title,
            l.prePurchase ? "Yes" : "No",
            l.leverage.toFixed(2),
            l.definition,
          ])}
        />

        <P>The exact patterns, as they appear in the code:</P>
        <div className="flex flex-col gap-3">
          {DEDUCTIVE_LABELS.map((l) => (
            <div key={l.code} className="rounded-lg border border-de-border bg-de-surface p-3">
              <p className="text-xs font-semibold text-de-text-primary">
                {l.code} — {l.title}
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {l.patterns.map((p, i) => (
                  <li key={i} className="font-mono text-[10px] leading-snug text-de-text-muted">
                    <span className="text-de-accent">{p.weight.toFixed(1)}</span> /{p.re.source}/
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section title="6. Sampling for the model layer">
        <P>
          The corpus is stratified by <em>source × platform × rating band</em>. The target n is allocated across strata
          proportionally to population, with a one-item floor per non-empty stratum and largest-remainder rounding, so a
          small but decisive stratum is never rounded away by a large one. Within a stratum, items are ordered by a hash
          of the run seed plus the item id and drawn from the top — deterministic, so the same corpus and seed always
          produce the same sample, and a screenshot in a deck can be reproduced.
        </P>
        <P>
          Theme discovery and classification see exactly the same sample. Discovering themes from one slice and
          classifying a different one is what pushed most items into a catch-all in the previous build. Items the model
          fails to return a tag for — a rate-limited batch, a truncated response — are reported as{" "}
          <em>unclassified</em>, not relabelled into the catch-all, so the catch-all count means what it says.
        </P>
      </Section>

      <Section title="7. Retrieval model">
        <P>
          There is no embedding model. The grounded Q&A box ranks the corpus with BM25 (k₁ = 1.5, b = 0.75) over a
          stop-worded, lowercased token stream, and passes the top 18 excerpts to the model. Lexical retrieval is enough
          for grounding short factual questions against a few hundred short reviews, needs no vector store or paid
          embedding API, and — relevant to this project&rsquo;s honesty claim — it cannot hallucinate a semantic match
          where no shared vocabulary exists.
        </P>
      </Section>

      <Section title="8. Opportunity score">
        <Code>{SCORING_FORMULA}</Code>
        <Table
          head={["Component", "Weight", "Definition"]}
          rows={SCORING_COMPONENT_NOTES.map((c) => [c.name, c.weight === null ? "×" : c.weight.toFixed(2), c.definition])}
        />
        <P>
          Leverage is the one judgement call in the formula, and it is published rather than buried: the per-label
          values are in the table in section 5. It is fixed across runs so two runs are comparable, and it is what stops
          a large post-purchase theme from outranking a smaller pre-purchase one purely on volume — which is exactly the
          failure mode of ranking themes by count alone.
        </P>
      </Section>

      <Section title="9. Segment cuts">
        <P>
          Cuts run over the whole labelled corpus, not the sample. Platform comes from which app or brand the item is
          about; rating bands are 1-2★ / 3★ / 4-5★ / unrated; recency is ≤90 days, 91-365 days, older, or unknown.
        </P>
        <P>
          Shopper type is inferred only where the text names it — {Object.values(SHOPPER_TYPE_LABELS).slice(0, 6).join(", ")}
          . Everything else is reported as &ldquo;{SHOPPER_TYPE_LABELS.unclassified}&rdquo;. An inferred segment with no
          evidence behind it would answer the brief&rsquo;s segment question falsely, which is worse than answering it
          partially.
        </P>
      </Section>

      <Section title="10. Prompts">
        <P>Theme induction (pass 1):</P>
        <Code>{THEME_SYSTEM_PROMPT}</Code>
        <P>Classification (pass 2) — the theme block is filled in per run from pass 1&rsquo;s output:</P>
        <Code>{EXAMPLE_CLASSIFY_PROMPT}</Code>
        <P>Grounded Q&A:</P>
        <Code>{ASK_SYSTEM_PROMPT}</Code>
      </Section>

      <Section title="11. What each channel can and cannot show">
        <div className="flex flex-col gap-3">
          {(Object.keys(CHANNEL_CLAIMS) as Array<keyof typeof CHANNEL_CLAIMS>).map((source) => (
            <div key={source} className="rounded-lg border border-de-border bg-de-surface p-3">
              <p className="text-xs font-semibold text-de-text-primary">{CHANNEL_LABELS[source]}</p>
              <p className="mt-1 text-[11px] text-[#3fbf7f]">Can reveal</p>
              <ul className="mt-0.5 space-y-0.5">
                {CHANNEL_CLAIMS[source].canReveal.map((t, i) => (
                  <li key={i} className="text-[11px] text-de-text-secondary">
                    • {t}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-[#e5a33f]">Cannot reveal</p>
              <ul className="mt-0.5 space-y-0.5">
                {CHANNEL_CLAIMS[source].cannotReveal.map((t, i) => (
                  <li key={i} className="text-[11px] text-de-text-secondary">
                    • {t}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section title="12. Limitations and known biases">
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-de-text-secondary">
          <li>
            <strong className="text-de-text-primary">Survivorship, and it is severe.</strong> App-store reviews are
            written by people who completed a transaction. The users this brief is about — the ones who saved something
            and never bought it — mostly leave no trace on any public channel. Reddit is the only channel here that
            reaches them at all, and it reaches a self-selected, more engaged slice of them.
          </li>
          <li>
            <strong className="text-de-text-primary">Volume is not importance.</strong> Logistics complaints dominate
            app-store review volume because that is what a review form is for. The opportunity score deliberately
            discounts them via the leverage term rather than letting raw counts decide the ranking.
          </li>
          <li>
            <strong className="text-de-text-primary">Rules over-match on short text.</strong> A one-word review saying
            &ldquo;size&rdquo; scores below the threshold and lands in OTHER; a long review mentioning size in passing
            may pick up FIT_SIZE. The rule-model agreement statistic on each run is the check on this, and it is
            reported rather than assumed.
          </li>
          <li>
            <strong className="text-de-text-primary">Language.</strong> Patterns are written for English and
            Hinglish-in-Latin-script. Reviews in Devanagari or other Indic scripts are collected but under-labelled.
          </li>
          <li>
            <strong className="text-de-text-primary">Recency skews by source.</strong> App-store feeds are sorted most
            recent first; Reddit search is sorted by relevance across all time. The recency cut makes that visible
            rather than correcting for it.
          </li>
          <li>
            <strong className="text-de-text-primary">Model coverage is quota-bound.</strong> The inductive layer runs on
            a free-tier token budget, which is why it is sampled and why its coverage percentage is printed next to
            every one of its numbers.
          </li>
          <li>
            <strong className="text-de-text-primary">Sentiment is model-assigned</strong> on the sample only, so the
            severity term falls back to star ratings — a coarser but complete measure — for most themes.
          </li>
        </ul>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-de-text-muted">{title}</h2>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-de-text-secondary">{children}</p>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-de-border bg-black/30 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-de-text-secondary">
      {children}
    </pre>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-de-border bg-de-surface">
      <table className="w-full min-w-[36rem] text-left text-xs">
        <thead className="text-de-text-muted">
          <tr className="border-b border-de-border">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-de-border/50 align-top last:border-0">
              {row.map((cell, j) => (
                <td key={j} className={j === 0 ? "px-3 py-2 font-semibold text-de-text-primary" : "px-3 py-2 text-de-text-secondary"}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
