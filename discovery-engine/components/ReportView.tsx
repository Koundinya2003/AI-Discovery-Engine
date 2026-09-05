"use client";

import { useState } from "react";
import type { RunResult } from "@/lib/types";
import Header from "./Header";
import CoveragePanel from "./CoveragePanel";
import SourceStatusPanel from "./SourceStatusPanel";
import OpportunityTable from "./OpportunityTable";
import ThemeCard from "./ThemeCard";
import SegmentPanel from "./SegmentPanel";
import ChannelCoverage from "./ChannelCoverage";
import ExportButtons from "./ExportButtons";
import AskBox from "./AskBox";

/** One report, rendered identically by the live run and by /run/{id}. */
export default function ReportView({ run }: { run: RunResult }) {
  const [taxonomy, setTaxonomy] = useState<"deductive" | "inductive">("deductive");
  const rows = taxonomy === "deductive" ? run.deductive : run.themes;

  return (
    <div className="flex flex-col gap-8">
      <Header
        productName={run.productName}
        platforms={run.platforms}
        createdAt={run.createdAt}
        runId={run.runId}
        persisted={run.persisted}
      />

      {run.notices.length > 0 && (
        <div className="rounded-xl border border-de-border bg-de-surface px-4 py-3">
          <ul className="space-y-1">
            {run.notices.map((n, i) => (
              <li key={i} className={n.level === "warn" ? "text-xs text-[#e5a33f]" : "text-xs text-de-text-muted"}>
                {n.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <CoveragePanel coverage={run.coverage} />
      <SourceStatusPanel sources={run.sources} />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-de-text-muted">
            Opportunity comparison — ranked
          </h2>
          <div className="flex gap-2">
            <TaxonomyTab
              active={taxonomy === "deductive"}
              onClick={() => setTaxonomy("deductive")}
              label={`Fixed frame (${run.deductive.length})`}
            />
            <TaxonomyTab
              active={taxonomy === "inductive"}
              onClick={() => setTaxonomy("inductive")}
              label={`Discovered themes (${run.themes.length})`}
            />
          </div>
        </div>

        <OpportunityTable
          rows={rows}
          scoring={run.scoring}
          caption={
            taxonomy === "deductive"
              ? "Fixed frame, applied by published rules to 100% of the analysed corpus. Items can carry several labels, so shares sum above 100%."
              : "Themes induced from the data by the model, on the stratified sample only. One theme per item."
          }
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-de-text-muted">
          {taxonomy === "deductive" ? "Fixed frame" : "Discovered themes"} — evidence
        </h2>
        {rows.length === 0 ? (
          <p className="rounded-xl border border-de-border bg-de-surface p-4 text-xs text-de-text-muted">
            Nothing to show for this taxonomy in this run.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((theme) => (
              <ThemeCard key={theme.code} theme={theme} />
            ))}
          </div>
        )}
      </section>

      <SegmentPanel segments={run.segments} />
      <ChannelCoverage channels={run.channels} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-de-text-muted">Export</h2>
        <ExportButtons run={run} />
        {!run.persisted && (
          <p className="text-[11px] text-de-text-muted">
            This run has no permalink: saved runs need a storage backend, which isn&rsquo;t configured on this
            deployment. Exports above work regardless.
          </p>
        )}
      </section>

      <AskBox run={run} />
    </div>
  );
}

function TaxonomyTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-lg bg-de-accent px-3 py-1.5 text-xs font-semibold text-white"
          : "rounded-lg border border-de-border bg-de-surface px-3 py-1.5 text-xs text-de-text-secondary hover:text-de-text-primary"
      }
    >
      {label}
    </button>
  );
}
