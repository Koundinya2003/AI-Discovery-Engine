import { NextRequest, NextResponse } from "next/server";
import type { DiscoverRequest, ProgressEvent, RunResult } from "@/lib/types";
import { runPipeline } from "@/lib/pipeline";
import { checkRateLimit, buildDiscoverCacheKey, getCachedDiscoverResult, setCachedDiscoverResult } from "@/lib/redis";
import { isPersistenceConfigured, newRunId, saveRun } from "@/lib/runs";
import { DEFAULT_COMPARISON_PLATFORMS } from "@/lib/platforms";
import { classifyError, reasonCopy } from "@/lib/errors";
import { log } from "@/lib/logger";

// Vercel Hobby allows up to 60s for a Node.js function with this declared.
export const maxDuration = 60;

const MAX_PRODUCT_NAME_LENGTH = 120;
const MAX_COMPARISON_PLATFORMS = 4;

function clientIdentifier(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

function ndjson(event: ProgressEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

/**
 * Responds with a stream of NDJSON progress events, ending in a single
 * `{"type":"result"}` line. Progress is real: each event carries counts the
 * pipeline has actually reached, not a timer walking through captions.
 *
 * Errors before the stream opens are ordinary JSON responses with a status
 * code; errors after it opens arrive as a final `{"type":"error"}` line,
 * because the status line has already been sent by then.
 */
export async function POST(req: NextRequest) {
  let body: DiscoverRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const productName = body.productName?.trim();
  if (!productName) {
    return NextResponse.json({ error: "Enter a platform name to analyse." }, { status: 400 });
  }
  if (productName.length > MAX_PRODUCT_NAME_LENGTH) {
    return NextResponse.json(
      { error: `Platform name must be ${MAX_PRODUCT_NAME_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }

  const comparisonPlatforms = (
    Array.isArray(body.comparisonPlatforms) ? body.comparisonPlatforms : DEFAULT_COMPARISON_PLATFORMS
  )
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim().slice(0, MAX_PRODUCT_NAME_LENGTH))
    .slice(0, MAX_COMPARISON_PLATFORMS);

  const identifier = clientIdentifier(req);
  const rateLimit = await checkRateLimit("discover", identifier);
  if (rateLimit.limited) {
    log.info("discover.rate_limited", { identifier, retryAfterSeconds: rateLimit.retryAfterSeconds });
    return NextResponse.json(
      {
        error: `You've run several analyses in a short window. Try again in about ${Math.ceil(
          (rateLimit.retryAfterSeconds ?? 60) / 60
        )} minute(s).`,
        retryAfterSeconds: rateLimit.retryAfterSeconds ?? 60,
      },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) } }
    );
  }

  const cacheKey = buildDiscoverCacheKey(productName, comparisonPlatforms, body.appStoreId, body.playPackage);
  const cached = await getCachedDiscoverResult(cacheKey);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ProgressEvent) => {
        try {
          controller.enqueue(ndjson(event));
        } catch {
          // The client hung up mid-run; the pipeline still finishes and caches.
        }
      };

      try {
        if (cached) {
          log.info("discover.cache_hit", { productName, cacheKey });
          emit({ type: "stage", stage: "cache", label: "Returning a recent run for this query" });
          emit({ type: "result", result: { ...cached, cached: true } });
          controller.close();
          return;
        }

        const runId = newRunId();
        log.info("discover.start", { runId, productName, comparisonPlatforms, identifier });

        const result: RunResult = await runPipeline(
          { productName, comparisonPlatforms, appStoreId: body.appStoreId, playPackage: body.playPackage, runId },
          emit
        );

        if (isPersistenceConfigured()) {
          emit({ type: "stage", stage: "save", label: "Saving this run" });
          result.persisted = await saveRun(result);
        }

        await setCachedDiscoverResult(cacheKey, result);
        emit({ type: "result", result });
      } catch (err) {
        const reason = classifyError(err);
        log.error("discover.failed", { productName, reason, error: String(err) });
        emit({
          type: "error",
          message: `${reasonCopy(reason).headline}: the analysis could not be completed. ${reasonCopy(reason).detail}`,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Disables proxy buffering so progress lines arrive as they're written.
      "X-Accel-Buffering": "no",
    },
  });
}
