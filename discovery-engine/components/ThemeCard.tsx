import type { ThemeResult } from "@/lib/types";
import SourceTag from "./SourceTag";

export default function ThemeCard({ theme }: { theme: ThemeResult }) {
  return (
    <div className="rounded-xl border border-de-border bg-de-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 rounded-md bg-de-accent/15 px-2 py-1 text-[11px] font-bold tracking-wide text-de-accent">
            {theme.code}
          </span>
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-de-text-primary leading-snug">{theme.title}</h3>
            <p className="mt-0.5 text-xs text-de-text-muted">{theme.definition}</p>
          </div>
        </div>
        <span className="shrink-0 text-lg font-semibold tabular-nums text-de-text-primary">{theme.count}</span>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-de-grid">
        <div
          className="h-full rounded-full bg-de-accent"
          style={{ width: `${Math.max(4, theme.relativeFrequency * 100)}%` }}
        />
      </div>

      {theme.quotes.length > 0 && (
        <ul className="mt-4 space-y-2.5">
          {theme.quotes.map((q, i) => (
            <li key={i} className="rounded-lg border border-de-border/60 bg-black/20 p-3">
              <p className="text-sm text-de-text-secondary leading-relaxed">&ldquo;{q.text}&rdquo;</p>
              <div className="mt-2">
                <SourceTag label={q.sourceLabel} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
