"use client";

import { useState } from "react";
import type { RunResult } from "@/lib/types";
import { exportFilename, toCsv, toOpportunityMarkdown } from "@/lib/export";

/**
 * Exports are generated in the browser from the run already in memory, so they
 * work whether or not the run was persisted. The permalink is separate: it
 * only appears when the deployment can actually resolve it.
 */
export default function ExportButtons({ run }: { run: RunResult }) {
  const [copied, setCopied] = useState<string | null>(null);

  function download(contents: string, filename: string, mime: string) {
    const blob = new Blob([contents], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied("clipboard unavailable");
      setTimeout(() => setCopied(null), 2000);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => download(toCsv(run), exportFilename(run, "csv"), "text/csv")} className={BTN}>
        Export CSV
      </button>
      <button
        type="button"
        onClick={() => download(JSON.stringify(run, null, 2), exportFilename(run, "json"), "application/json")}
        className={BTN}
      >
        Export JSON
      </button>
      <button
        type="button"
        onClick={() =>
          copy(
            `### Fixed frame\n\n${toOpportunityMarkdown(run, "deductive")}\n\n### Discovered themes\n\n${toOpportunityMarkdown(
              run,
              "inductive"
            )}`,
            "markdown"
          )
        }
        className={BTN}
      >
        Copy tables as markdown
      </button>
      {run.persisted && (
        <button
          type="button"
          onClick={() => copy(`${window.location.origin}/run/${run.runId}`, "permalink")}
          className={BTN}
        >
          Copy permalink
        </button>
      )}
      {copied && <span className="text-xs text-de-text-muted">Copied {copied}.</span>}
    </div>
  );
}

const BTN =
  "rounded-lg border border-de-border bg-de-surface px-3 py-1.5 text-xs font-medium text-de-text-secondary transition hover:text-de-text-primary";
