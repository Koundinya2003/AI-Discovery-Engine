// Upstash Redis (free tier, REST-based — no persistent connections, safe on
// serverless) backs two things: per-IP rate limiting and discover-result
// caching. Both are entirely optional: without UPSTASH_REDIS_REST_URL /
// UPSTASH_REDIS_REST_TOKEN configured, every function below is a no-op that
// never blocks or caches, so local dev with no Redis account behaves exactly
// as it did before this file existed.

import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import type { DiscoverResponse } from "@/lib/types";
import { log } from "@/lib/logger";

const RATE_LIMIT_WINDOW = "10 m";
const DISCOVER_RATE_LIMIT = Number(process.env.DISCOVER_RATE_LIMIT ?? 5);
const ASK_RATE_LIMIT = Number(process.env.ASK_RATE_LIMIT ?? 20);
const CACHE_TTL_SECONDS = Number(process.env.DISCOVER_CACHE_TTL_SECONDS ?? 3600);

function buildRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const redis = buildRedis();

if (!redis) {
  log.info("redis.not_configured", { effect: "rate limiting and caching are disabled" });
}

const discoverLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(DISCOVER_RATE_LIMIT, RATE_LIMIT_WINDOW), prefix: "ratelimit:discover" })
  : null;

const askLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(ASK_RATE_LIMIT, RATE_LIMIT_WINDOW), prefix: "ratelimit:ask" })
  : null;

export type RateLimitResult = { limited: boolean; retryAfterSeconds?: number };

export async function checkRateLimit(kind: "discover" | "ask", identifier: string): Promise<RateLimitResult> {
  const limiter = kind === "discover" ? discoverLimiter : askLimiter;
  if (!limiter) return { limited: false };

  try {
    const { success, reset } = await limiter.limit(identifier);
    if (success) return { limited: false };
    return { limited: true, retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1000)) };
  } catch (err) {
    // Redis being unreachable should never take the app down — fail open.
    log.error("redis.rate_limit_check_failed", { kind, error: String(err) });
    return { limited: false };
  }
}

export function buildDiscoverCacheKey(productName: string, appStoreId?: string, playPackage?: string): string {
  const normalized = productName.trim().toLowerCase();
  return `discover:${normalized}:${appStoreId ?? ""}:${playPackage ?? ""}`;
}

export async function getCachedDiscoverResult(key: string): Promise<DiscoverResponse | null> {
  if (!redis) return null;
  try {
    return await redis.get<DiscoverResponse>(key);
  } catch (err) {
    log.error("redis.cache_get_failed", { key, error: String(err) });
    return null;
  }
}

export async function setCachedDiscoverResult(key: string, value: DiscoverResponse): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(key, value, { ex: CACHE_TTL_SECONDS });
  } catch (err) {
    log.error("redis.cache_set_failed", { key, error: String(err) });
  }
}
