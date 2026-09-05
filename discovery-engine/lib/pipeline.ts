// The run pipeline, in one place, emitting progress as it goes.
//
//   1. collect   — every source × every platform, in parallel
//   2. prepare   — dedupe, then apply the deductive frame to 100% of items
//   3. sample    — deterministic stratified draw for the LLM layer
//   4. induce    — discover themes from that sample, classify that same sample
//   5. score     — opportunity table, segment cuts, channel coverage
//
// Step 4 is the only step that needs an LLM, and it is allowed to fail: a run
// with no Groq key still produces a full deductive analysis over the whole
// corpus. That is deliberate — the numbers the brief grades come from step 5,
// and step 5 does not depend on a free-tier token budget.

import type {
  Coverage,
  LabelledItem,
  Notice,
  ProgressEvent,
  RunResult,
  SourceKind,
  SourceStatus,
  Theme,
} from "@/lib/types";
import { resolvePlatform, type PlatformSpec } from "@/lib/platforms";
import { collectAppStore } from "@/lib/collectors/app_store";
import { collectPlayStore } from "@/lib/collectors/play_store";
import { collectYouTube, isYouTubeConfigured } from "@/lib/collectors/youtube";
import { collectReddit } from "@/lib/collectors/reddit";
import { classifyError, reasonCopy, scrubForDisplay, type UnavailableReason } from "@/lib/errors";
import { dedupe, labelCorpus } from "@/lib/corpus";
import { DEFAULT_SAMPLE_SEED, describeSamplingRule, stratifiedSample } from "@/lib/sampling";
import { discoverThemes } from "@/lib/groq/themes";
import { CLASSIFY_MAX_ITEMS, classifyItems } from "@/lib/groq/classify";
import { buildDeductiveRows, buildInductiveRows, buildScoringContext, scoringManifest } from "@/lib/analysis/opportunity";
import { buildSegments } from "@/lib/analysis/segments";
import { CHANNEL_LABELS, buildChannelCoverage } from "@/lib/analysis/channels";
import { log } from "@/lib/logger";

/** Corpus text is capped for transport; the Ask box and export use this copy. */
const MAX_CORPUS_TEXT_CHARS = 1000;
const MAX_CORPUS_ITEMS = 2500;

export type PipelineInput = {
  productName: string;
  comparisonPlatforms: string[];
  appStoreId?: string;
  playPackage?: string;
  runId: string;
};

export type Emit = (event: ProgressEvent) => void;

function sourceStatus(
  source: SourceKind,
  count: number,
  breakdown: SourceStatus["breakdown"],
  reason?: UnavailableReason,
  rejected?: SourceStatus["rejected"]
): SourceStatus {
  const status: SourceStatus = { source, label: CHANNEL_LABELS[source], count, breakdown, rejected };
  if (count === 0) {
    const r = reason ?? "no_results";
    const copy = reasonCopy(r);
    status.unavailable = { reason: r, headline: copy.headline, detail: scrubForDisplay(copy.detail) };
  }
  return status;
}

async function collectAppReviews(
  kind: "app_store" | "play_store",
  platforms: PlatformSpec[]
): Promise<{ status: SourceStatus; items: LabelledItem[] | never[]; resolved: Array<{ platform: string; title: string }> }> {
  const collect = kind === "app_store" ? collectAppStore : collectPlayStore;

  const settled = await Promise.allSettled(platforms.map((p) => collect(p).then((r) => ({ platform: p, ...r }))));

  const items: Array<Awaited<ReturnType<typeof collectAppStore>>["items"][number]> = [];
  const breakdown: SourceStatus["breakdown"] = [];
  const resolved: Array<{ platform: string; title: string }> = [];
  const failures: UnavailableReason[] = [];
  const rejected: SourceStatus["rejected"] = [];

  settled.forEach((outcome, i) => {
    const platform = platforms[i];
    if (outcome.status === "rejected") {
      const reason = classifyError(outcome.reason);
      failures.push(reason);
      log.error(`${kind}.platform_failed`, { platform: platform.label, reason, error: String(outcome.reason) });
      rejected.push({ label: `${platform.label}: ${reasonCopy(reason).headline.toLowerCase()}`, count: 0 });
      return;
    }
    items.push(...outcome.value.items);
    breakdown.push({ label: platform.label, count: outcome.value.items.length });
    resolved.push({ platform: platform.label, title: outcome.value.resolvedTitle });
  });

  const status = sourceStatus(
    kind,
    items.length,
    breakdown.sort((a, b) => b.count - a.count),
    failures[0],
    rejected.length ? rejected : undefined
  );

  return { status, items: items as never[], resolved };
}

export async function runPipeline(input: PipelineInput, emit: Emit): Promise<RunResult> {
  const startedAt = Date.now();
  const notices: Notice[] = [];

  const primary = resolvePlatform(input.productName, {
    appStoreId: input.appStoreId,
    playPackage: input.playPackage,
  });
  const comparisons = input.comparisonPlatforms
    .map((label) => resolvePlatform(label))
    .filter((p) => p.key !== primary.key);
  const platforms = [primary, ...comparisons];

  // ── 1. Collect ────────────────────────────────────────────────────────────
  emit({
    type: "stage",
    stage: "collect",
    label: "Collecting",
    detail: `${platforms.length} platform${platforms.length === 1 ? "" : "s"} across 4 channels`,
  });

  const [playResult, appResult, redditResult, youtubeResult] = await Promise.all([
    collectAppReviews("play_store", platforms),
    collectAppReviews("app_store", platforms),
    collectReddit(platforms).catch((err) => {
      log.error("reddit.failed", { error: String(err) });
      return { items: [], breakdown: [], rejected: undefined, failureReason: classifyError(err) };
    }),
    isYouTubeConfigured()
      ? collectYouTube(platforms).catch((err) => {
          log.error("youtube.failed", { error: String(err) });
          return { items: [], breakdown: [], rejected: undefined, failureReason: classifyError(err) };
        })
      : Promise.resolve({ items: [], breakdown: [], rejected: undefined, failureReason: "not_configured" as const }),
  ]);

  const sources: SourceStatus[] = [
    playResult.status,
    appResult.status,
    sourceStatus("reddit", redditResult.items.length, redditResult.breakdown, redditResult.failureReason, redditResult.rejected),
    sourceStatus("youtube", youtubeResult.items.length, youtubeResult.breakdown, youtubeResult.failureReason, youtubeResult.rejected),
  ];

  for (const s of sources) {
    emit({
      type: "source",
      source: s.source,
      label: s.label,
      count: s.count,
      state: s.unavailable ? "unavailable" : "done",
    });
  }

  const resolvedMatches = [...playResult.resolved, ...appResult.resolved];
  for (const match of resolvedMatches) {
    notices.push({ level: "info", message: scrubForDisplay(`Resolved ${match.platform} → “${match.title}”`) });
  }

  const collected = [...playResult.items, ...appResult.items, ...redditResult.items, ...youtubeResult.items];

  // ── 2. Prepare ────────────────────────────────────────────────────────────
  emit({ type: "stage", stage: "prepare", label: "De-duplicating and applying the fixed frame" });

  const { items: deduped, duplicatesRemoved } = dedupe(collected);
  const capped = deduped.slice(0, MAX_CORPUS_ITEMS);
  if (deduped.length > capped.length) {
    notices.push({
      level: "warn",
      message: `Corpus capped at ${MAX_CORPUS_ITEMS} items for this run; ${deduped.length - capped.length} additional collected items were not analysed.`,
    });
  }

  const corpus: LabelledItem[] = labelCorpus(capped).map((item) => ({
    ...item,
    text: item.text.length > MAX_CORPUS_TEXT_CHARS ? `${item.text.slice(0, MAX_CORPUS_TEXT_CHARS)}…` : item.text,
  }));

  emit({ type: "counts", scraped: collected.length, analysed: corpus.length, sampled: 0, classified: 0 });

  // ── 3. Sample ─────────────────────────────────────────────────────────────
  const seed = process.env.SAMPLE_SEED || DEFAULT_SAMPLE_SEED;
  const { sample, strata } = stratifiedSample(corpus, {
    key: (i) => `${i.sourceLabel} · ${i.platform} · ${i.ratingBand}`,
    id: (i) => i.id,
    size: Math.min(CLASSIFY_MAX_ITEMS, corpus.length),
    seed,
  });
  const sampledIds = new Set(sample.map((i) => i.id));
  for (const item of corpus) item.sampled = sampledIds.has(item.id);

  emit({
    type: "counts",
    scraped: collected.length,
    analysed: corpus.length,
    sampled: sample.length,
    classified: 0,
  });

  // ── 4. Induce (optional) ──────────────────────────────────────────────────
  let themes: Theme[] = [];
  let llmClassified = 0;
  let agreementHits = 0;
  let agreementAudited = 0;

  if (corpus.length === 0) {
    notices.push({ level: "warn", message: "No items were collected, so there was nothing to analyse." });
  } else if (!process.env.GROQ_API_KEY) {
    notices.push({
      level: "warn",
      message:
        "Inductive theme discovery is unavailable in this deployment, so only the fixed frame is reported. Every number below still covers 100% of the corpus.",
    });
  } else {
    emit({ type: "stage", stage: "induce", label: "Discovering themes from the sample", detail: `n = ${sample.length}` });
    try {
      themes = await discoverThemes(input.productName, sample);
      emit({
        type: "stage",
        stage: "classify",
        label: `Classifying the sample against ${themes.length} discovered themes`,
      });

      const { tags, failedBatches } = await classifyItems(sample, themes);
      const byId = new Map(tags.map((t) => [t.itemId, t]));

      for (const item of corpus) {
        const tag = byId.get(item.id);
        if (!tag) continue;
        item.themeCode = tag.themeCode;
        item.sentiment = tag.sentiment;
        llmClassified++;
        agreementAudited++;
        if (tag.deductive.some((code) => item.deductive.includes(code))) agreementHits++;
      }

      if (failedBatches > 0) {
        notices.push({
          level: "warn",
          message: `${failedBatches} classification batch${failedBatches === 1 ? "" : "es"} could not be completed within this deployment's model quota. Those items are counted as unclassified rather than assigned a theme.`,
        });
      }
    } catch (err) {
      const reason = classifyError(err);
      log.error("pipeline.induction_failed", { reason, error: String(err) });
      notices.push({
        level: "warn",
        message: `Inductive theme discovery could not complete (${reasonCopy(reason).headline.toLowerCase()}). The fixed-frame analysis below is unaffected and still covers 100% of the corpus.`,
      });
    }
  }

  emit({
    type: "counts",
    scraped: collected.length,
    analysed: corpus.length,
    sampled: sample.length,
    classified: llmClassified,
  });

  // ── 5. Score ──────────────────────────────────────────────────────────────
  emit({ type: "stage", stage: "score", label: "Scoring opportunities and cutting segments" });

  const platformLabels = [...new Set(corpus.map((i) => i.platform))].sort();
  const ctx = buildScoringContext(corpus, platformLabels);

  const coverage: Coverage = {
    scraped: collected.length,
    duplicatesRemoved,
    analysed: corpus.length,
    deductivelyClassified: corpus.length,
    deductiveCoveragePct: corpus.length > 0 ? 100 : 0,
    llmSampled: sample.length,
    llmClassified,
    llmCoveragePct: corpus.length > 0 ? Number(((llmClassified / corpus.length) * 100).toFixed(1)) : 0,
    samplingRule: describeSamplingRule(Math.min(CLASSIFY_MAX_ITEMS, corpus.length), strata.length, seed),
    strata: strata.filter((s) => s.population > 0).sort((a, b) => b.population - a.population),
    ruleModelAgreement: agreementAudited > 0 ? Number((agreementHits / agreementAudited).toFixed(3)) : null,
    ruleModelAudited: agreementAudited,
  };

  const result: RunResult = {
    runId: input.runId,
    createdAt: new Date().toISOString(),
    productName: input.productName,
    platforms: platforms.map((p) => p.label),
    sources,
    coverage,
    themes: buildInductiveRows(themes, corpus, ctx),
    deductive: buildDeductiveRows(corpus, ctx),
    segments: buildSegments(corpus),
    channels: buildChannelCoverage(corpus, sources),
    scoring: scoringManifest(),
    corpus,
    notices,
    persisted: false,
  };

  log.info("pipeline.complete", {
    runId: input.runId,
    productName: input.productName,
    platforms: platforms.length,
    scraped: collected.length,
    analysed: corpus.length,
    llmClassified,
    durationMs: Date.now() - startedAt,
  });

  return result;
}
