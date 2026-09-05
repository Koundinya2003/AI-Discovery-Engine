import Link from "next/link";
import type { Metadata } from "next";
import { loadRun, isPersistenceConfigured } from "@/lib/runs";
import ReportView from "@/components/ReportView";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/run/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const run = await loadRun(id);
  return {
    title: run ? `${run.productName} — Discovery Engine run` : "Run not found — Discovery Engine",
    description: run
      ? `Opportunity analysis of ${run.coverage.analysed} public items about ${run.platforms.join(", ")}.`
      : "This run has expired or never existed.",
  };
}

/**
 * The permalink. A completed run gets a stable URL so a specific result can be
 * linked from a slide rather than re-run (and re-sampled) live during a review.
 */
export default async function RunPage(props: PageProps<"/run/[id]">) {
  const { id } = await props.params;
  const run = isPersistenceConfigured() ? await loadRun(id) : null;

  if (!run) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-16 sm:px-6">
        <h1 className="text-2xl font-bold text-de-text-primary">This run isn&rsquo;t available</h1>
        <p className="text-sm text-de-text-secondary">
          {isPersistenceConfigured()
            ? "The link is valid but the run has expired or was never saved. Runs are kept for a limited window."
            : "Saved runs need a storage backend, which isn't configured on this deployment. A fresh analysis still works, and its results can be exported as CSV or JSON."}
        </p>
        <Link href="/" className="text-sm text-de-accent underline underline-offset-2">
          ← Run a new analysis
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <Link href="/" className="text-de-accent underline underline-offset-2">
          ← New analysis
        </Link>
        <span className="text-de-text-muted">·</span>
        <Link href="/methodology" className="text-de-accent underline underline-offset-2">
          Methodology
        </Link>
        <span className="text-de-text-muted">·</span>
        <a href={`/api/run/${run.runId}`} className="text-de-accent underline underline-offset-2">
          Raw JSON
        </a>
        <span className="text-de-text-muted">·</span>
        <a href={`/api/run/${run.runId}?format=csv`} className="text-de-accent underline underline-offset-2">
          CSV
        </a>
      </div>
      <ReportView run={run} />
    </main>
  );
}
