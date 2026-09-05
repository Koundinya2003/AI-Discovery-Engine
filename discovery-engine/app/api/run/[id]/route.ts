import { NextResponse } from "next/server";
import { loadRun, isPersistenceConfigured } from "@/lib/runs";
import { toCsv, exportFilename } from "@/lib/export";

export const dynamic = "force-dynamic";

/**
 * Fetch a saved run as JSON, or as CSV with `?format=csv`. This is the machine
 * half of the permalink: /run/{id} renders it, this serves it.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/run/[id]">) {
  const { id } = await ctx.params;

  if (!isPersistenceConfigured()) {
    return NextResponse.json(
      { error: "Saved runs aren't available on this deployment, so this link can't be resolved." },
      { status: 501 }
    );
  }

  const run = await loadRun(id);
  if (!run) {
    return NextResponse.json({ error: "This run has expired or never existed." }, { status: 404 });
  }

  const format = new URL(_req.url).searchParams.get("format");
  if (format === "csv") {
    return new Response(toCsv(run), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(run, "csv")}"`,
      },
    });
  }

  return NextResponse.json(run);
}
