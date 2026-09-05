import type { SourceStatus } from "@/lib/types";

/**
 * Per-source outcome. A source that produced nothing shows a category and a
 * plain-English reason from a fixed table — never an exception string, a URL,
 * or the name of an environment variable.
 */
export default function SourceStatusPanel({ sources }: { sources: SourceStatus[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-de-text-muted">Sources</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sources.map((s) => (
          <div key={s.source} className="rounded-xl border border-de-border bg-de-surface p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-de-text-secondary">{s.label}</span>
              <span className="text-xl font-semibold tabular-nums text-de-text-primary">{s.count}</span>
            </div>

            {s.unavailable ? (
              <div className="mt-2 rounded-lg border border-[#e5a33f]/30 bg-[#e5a33f]/10 px-2.5 py-2">
                <p className="text-[11px] font-semibold text-[#e5a33f]">Source unavailable — {s.unavailable.headline}</p>
                <p className="mt-1 text-[11px] leading-snug text-de-text-secondary">{s.unavailable.detail}</p>
              </div>
            ) : (
              <ul className="mt-2 space-y-1">
                {s.breakdown.slice(0, 6).map((b) => (
                  <li key={b.label} className="flex items-baseline justify-between gap-2 text-[11px] text-de-text-muted">
                    <span className="truncate">{b.label}</span>
                    <span className="tabular-nums">{b.count}</span>
                  </li>
                ))}
              </ul>
            )}

            {s.rejected && s.rejected.length > 0 && (
              <p className="mt-2 text-[11px] leading-snug text-de-text-muted">
                Excluded:{" "}
                {s.rejected.map((r) => (r.count > 0 ? `${r.count} ${r.label}` : r.label)).join("; ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
