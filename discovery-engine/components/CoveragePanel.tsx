"use client";

import { useState } from "react";
import type { Coverage } from "@/lib/types";
import StatTile from "./StatTile";

/**
 * The credibility panel. Every reduction between "scraped" and "classified" is
 * a number on this screen, and the sampling rule is printed verbatim rather
 * than described — a reader can recompute the sample from it.
 */
export default function CoveragePanel({ coverage }: { coverage: Coverage }) {
  const [strataOpen, setStrataOpen] = useState(false);

  const dedupePct = coverage.scraped > 0 ? (coverage.duplicatesRemoved / coverage.scraped) * 100 : 0;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-de-text-muted">Coverage</h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile value={coverage.scraped} caption="Items scraped" sub="Raw, before any filtering" />
        <StatTile
          value={coverage.duplicatesRemoved}
          caption="Duplicates / empties removed"
          sub={`${dedupePct.toFixed(1)}% of scraped`}
          tone={coverage.duplicatesRemoved > 0 ? "warn" : "default"}
        />
        <StatTile
          value={`${coverage.deductivelyClassified} of ${coverage.analysed}`}
          caption="Classified — fixed frame"
          sub={`${coverage.deductiveCoveragePct}% coverage, rules, no sampling`}
          tone="good"
        />
        <StatTile
          value={`${coverage.llmClassified} of ${coverage.analysed}`}
          caption="Classified — discovered themes"
          sub={`${coverage.llmCoveragePct}% coverage, stratified sample of ${coverage.llmSampled}`}
          tone={coverage.llmCoveragePct < 20 ? "warn" : "default"}
        />
      </div>

      <div className="rounded-xl border border-de-border bg-de-surface p-4 text-xs leading-relaxed text-de-text-secondary">
        <p>
          <span className="font-semibold text-de-text-primary">Sampling rule.</span> {coverage.samplingRule}
        </p>
        <p className="mt-2">
          The fixed frame is applied by published rules to every analysed item, so its shares are true shares of{" "}
          {coverage.analysed}. Discovered themes come from a language model and are therefore capped by this
          deployment&rsquo;s model quota; their shares are computed against {coverage.llmClassified} classified items and
          never against the full corpus.
        </p>
        {coverage.ruleModelAgreement !== null && (
          <p className="mt-2">
            <span className="font-semibold text-de-text-primary">Rule–model agreement.</span>{" "}
            {(coverage.ruleModelAgreement * 100).toFixed(0)}% of the {coverage.ruleModelAudited} audited items shared at
            least one frame label between the rules and the model&rsquo;s own reading.
          </p>
        )}

        {coverage.strata.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setStrataOpen((v) => !v)}
              className="mt-3 text-xs font-medium text-de-accent underline decoration-de-border underline-offset-4"
            >
              {strataOpen ? "Hide" : "Show"} the {coverage.strata.length} strata drawn
            </button>
            {strataOpen && (
              <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-de-border/60">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 bg-de-surface text-de-text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">Stratum (source · platform · rating band)</th>
                      <th className="px-3 py-2 text-right font-medium">Population</th>
                      <th className="px-3 py-2 text-right font-medium">Drawn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverage.strata.map((s) => (
                      <tr key={s.stratum} className="border-t border-de-border/60">
                        <td className="px-3 py-1.5">{s.stratum}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{s.population}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{s.drawn}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
