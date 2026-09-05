import type { OpportunityRow } from "@/lib/types";
import SourceTag from "./SourceTag";

export default function ThemeCard({ theme }: { theme: OpportunityRow }) {
  return (
    <div className="flex flex-col rounded-xl border border-de-border bg-de-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 shrink-0 rounded-md bg-de-accent/15 px-2 py-1 text-[11px] font-bold tracking-wide text-de-accent">
            {theme.code}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-semibold leading-snug text-de-text-primary">{theme.title}</h3>
            <p className="mt-0.5 text-xs text-de-text-muted">{theme.definition}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-semibold tabular-nums text-de-text-primary">{theme.volume}</div>
          <div className="text-[10px] uppercase tracking-wide text-de-text-muted">
            {(theme.shareOfCorpus * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-de-grid">
        <div
          className="h-full rounded-full bg-de-accent"
          style={{ width: `${Math.max(4, theme.relativeFrequency * 100)}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <SourceTag label={`opportunity ${theme.opportunityScore.toFixed(1)}`} tone="accent" />
        {theme.meanRating !== null && <SourceTag label={`mean ${theme.meanRating.toFixed(2)}★`} />}
        {theme.platformSplit.slice(0, 3).map((p) => (
          <SourceTag key={p.platform} label={`${p.platform} ${Math.round(p.share * 100)}%`} />
        ))}
      </div>

      {theme.quotes.length > 0 && (
        <ul className="mt-4 space-y-2.5">
          {theme.quotes.map((q, i) => (
            <li key={i} className="rounded-lg border border-de-border/60 bg-black/20 p-3">
              <p className="text-sm leading-relaxed text-de-text-secondary">&ldquo;{q.text}&rdquo;</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <SourceTag label={q.sourceLabel} />
                <SourceTag label={q.platform} />
                {typeof q.rating === "number" && <SourceTag label={`${q.rating}★`} />}
                <a
                  href={q.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] uppercase tracking-wide text-de-accent underline underline-offset-2"
                >
                  source
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
