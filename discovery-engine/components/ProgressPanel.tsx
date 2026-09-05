"use client";

import type { ProgressEvent, SourceKind } from "@/lib/types";

export type ProgressState = {
  stages: Array<{ stage: string; label: string; detail?: string }>;
  sources: Array<{ source: SourceKind; label: string; count: number; state: "done" | "unavailable" }>;
  counts: { scraped: number; analysed: number; sampled: number; classified: number } | null;
};

export const EMPTY_PROGRESS: ProgressState = { stages: [], sources: [], counts: null };

/** Fold one streamed event into the progress state. */
export function reduceProgress(state: ProgressState, event: ProgressEvent): ProgressState {
  switch (event.type) {
    case "stage":
      return { ...state, stages: [...state.stages, { stage: event.stage, label: event.label, detail: event.detail }] };
    case "source": {
      const sources = state.sources.filter((s) => s.source !== event.source);
      return {
        ...state,
        sources: [...sources, { source: event.source, label: event.label, count: event.count, state: event.state }],
      };
    }
    case "counts":
      return {
        ...state,
        counts: {
          scraped: event.scraped,
          analysed: event.analysed,
          sampled: event.sampled,
          classified: event.classified,
        },
      };
    default:
      return state;
  }
}

/**
 * Live progress with real counts. Every number here came off the wire from the
 * pipeline — there is no timer walking through captions while the request
 * blocks, which is what the old "Discovering…" spinner did.
 */
export default function ProgressPanel({ progress }: { progress: ProgressState }) {
  const current = progress.stages[progress.stages.length - 1];

  return (
    <div className="rounded-xl border border-de-border bg-de-surface p-4" role="status" aria-live="polite">
      <div className="flex items-center gap-2">
        <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-de-border border-t-de-accent" />
        <span className="text-sm text-de-text-primary">{current?.label ?? "Starting…"}</span>
        {current?.detail && <span className="text-xs text-de-text-muted">{current.detail}</span>}
      </div>

      {progress.sources.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {progress.sources.map((s) => (
            <li
              key={s.source}
              className={
                s.state === "unavailable"
                  ? "rounded-lg border border-[#e5a33f]/30 bg-[#e5a33f]/10 px-2.5 py-1 text-[11px] text-[#e5a33f]"
                  : "rounded-lg border border-de-border bg-black/20 px-2.5 py-1 text-[11px] text-de-text-secondary"
              }
            >
              {s.label}: {s.state === "unavailable" ? "unavailable" : `${s.count} items`}
            </li>
          ))}
        </ul>
      )}

      {progress.counts && (
        <p className="mt-3 text-[11px] tabular-nums text-de-text-muted">
          {progress.counts.scraped} scraped · {progress.counts.analysed} analysed · {progress.counts.sampled} sampled ·{" "}
          {progress.counts.classified} model-classified
        </p>
      )}

      {progress.stages.length > 1 && (
        <ol className="mt-3 space-y-0.5">
          {progress.stages.slice(0, -1).map((s, i) => (
            <li key={`${s.stage}-${i}`} className="text-[11px] text-de-text-muted">
              ✓ {s.label}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
