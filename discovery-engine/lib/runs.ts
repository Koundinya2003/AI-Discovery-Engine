// Run persistence, so a completed run has a URL a slide can link to.
//
// Backed by the same optional Upstash Redis as rate limiting and caching. With
// no Redis configured a run still completes and still exports — it just has no
// permalink, and the UI says so plainly instead of handing out a link that
// would 404 the moment someone clicked it from a deck.

import { Redis } from "@upstash/redis";
import type { RunResult } from "@/lib/types";
import { log } from "@/lib/logger";

const RUN_TTL_SECONDS = Number(process.env.RUN_TTL_SECONDS ?? 60 * 60 * 24 * 30); // 30 days
/** Upstash rejects very large values; trim the corpus to fit rather than fail. */
const MAX_PERSIST_BYTES = 900_000;
const PERSIST_TEXT_CHARS = 320;

function buildRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const redis = buildRedis();

export function isPersistenceConfigured(): boolean {
  return redis !== null;
}

export function newRunId(): string {
  // Short, URL-safe, and collision-resistant enough for a personal deployment.
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}${rand}`;
}

function shrinkToFit(run: RunResult): RunResult {
  let candidate: RunResult = {
    ...run,
    corpus: run.corpus.map((item) => ({
      ...item,
      text: item.text.length > PERSIST_TEXT_CHARS ? `${item.text.slice(0, PERSIST_TEXT_CHARS)}…` : item.text,
    })),
  };

  if (JSON.stringify(candidate).length <= MAX_PERSIST_BYTES) return candidate;

  // Still too big: drop corpus items from the tail (the sample and every
  // aggregate are already computed, so this only shortens what the permalink's
  // Ask box can retrieve over) and say so in the run's own notices.
  let keep = candidate.corpus.length;
  while (keep > 100 && JSON.stringify(candidate).length > MAX_PERSIST_BYTES) {
    keep = Math.floor(keep * 0.75);
    candidate = { ...candidate, corpus: candidate.corpus.slice(0, keep) };
  }

  if (keep < run.corpus.length) {
    candidate = {
      ...candidate,
      notices: [
        ...candidate.notices,
        {
          level: "warn",
          message: `The saved copy of this run stores ${keep} of ${run.corpus.length} corpus items to fit the storage limit. Every count, share and score above was computed on the full corpus.`,
        },
      ],
    };
  }

  return candidate;
}

export async function saveRun(run: RunResult): Promise<boolean> {
  if (!redis) return false;
  try {
    await redis.set(`run:${run.runId}`, shrinkToFit({ ...run, persisted: true }), { ex: RUN_TTL_SECONDS });
    return true;
  } catch (err) {
    log.error("runs.save_failed", { runId: run.runId, error: String(err) });
    return false;
  }
}

export async function loadRun(runId: string): Promise<RunResult | null> {
  if (!redis) return null;
  try {
    return await redis.get<RunResult>(`run:${runId}`);
  } catch (err) {
    log.error("runs.load_failed", { runId, error: String(err) });
    return null;
  }
}
