import type { ChannelCoverageRow } from "@/lib/types";

/**
 * The honest framing of the null result. Each channel's structural limits are
 * stated next to the measured share of its items that carry any pre-purchase
 * signal at all — so "app reviews cannot tell you why a wishlist item went
 * unbought" is a claim the run's own numbers support, not an excuse.
 */
export default function ChannelCoverage({ channels }: { channels: ChannelCoverageRow[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-de-text-muted">Channel coverage</h2>
      <p className="text-xs text-de-text-secondary">
        What each source can and cannot reveal about a wishlist item that was never bought. The percentage is measured
        in this run: the share of that channel&rsquo;s items carrying at least one pre-purchase frame label.
      </p>

      <div className="grid gap-3 lg:grid-cols-2">
        {channels.map((c) => (
          <div key={c.source} className="rounded-xl border border-de-border bg-de-surface p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold text-de-text-primary">{c.label}</h3>
              <span className="text-xs tabular-nums text-de-text-muted">
                {c.collected} items ·{" "}
                {c.prePurchaseShare === null ? (
                  "no data"
                ) : (
                  <span className={c.prePurchaseShare >= 0.4 ? "text-[#3fbf7f]" : "text-[#e5a33f]"}>
                    {(c.prePurchaseShare * 100).toFixed(0)}% pre-purchase
                  </span>
                )}
              </span>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#3fbf7f]">Can reveal</p>
                <ul className="mt-1 space-y-1">
                  {c.canReveal.map((t, i) => (
                    <li key={i} className="text-[11px] leading-snug text-de-text-secondary">
                      • {t}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#e5a33f]">Cannot reveal</p>
                <ul className="mt-1 space-y-1">
                  {c.cannotReveal.map((t, i) => (
                    <li key={i} className="text-[11px] leading-snug text-de-text-secondary">
                      • {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
