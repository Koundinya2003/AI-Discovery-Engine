// Source failure handling.
//
// Nothing raw from an exception ever reaches the browser. A collector that
// fails produces a *category* plus a message drawn from a fixed table below,
// so an unconfigured key surfaces as "Source unavailable — not configured"
// rather than leaking the literal env-var name (or an upstream URL with a key
// in the query string) into the UI. The raw error still goes to the server log,
// where it belongs, via `log.error` at the call site.

export type UnavailableReason =
  | "not_configured"
  | "no_results"
  | "blocked"
  | "rate_limited"
  | "timeout"
  | "network"
  | "upstream_error"
  | "no_confident_match";

/** Fixed, user-facing copy per reason. Never interpolates raw error text. */
const REASON_COPY: Record<UnavailableReason, { headline: string; detail: string }> = {
  not_configured: {
    headline: "Not configured",
    detail: "This source needs credentials that aren't set for this deployment, so it was skipped.",
  },
  no_results: {
    headline: "No matching content",
    detail: "The source responded normally but had nothing matching this query.",
  },
  blocked: {
    headline: "Access blocked",
    detail: "The source refused automated access for this request.",
  },
  rate_limited: {
    headline: "Rate limited",
    detail: "The source is throttling requests right now. Retrying later usually works.",
  },
  timeout: {
    headline: "Timed out",
    detail: "The source didn't respond inside this run's time budget.",
  },
  network: {
    headline: "Unreachable",
    detail: "The source couldn't be reached from the server.",
  },
  upstream_error: {
    headline: "Source error",
    detail: "The source returned an unexpected response.",
  },
  no_confident_match: {
    headline: "No confident match",
    detail: "No listing on this source matched the platform name closely enough to trust, so nothing was collected rather than risk the wrong product's reviews.",
  },
};

export class SourceUnavailableError extends Error {
  readonly reason: UnavailableReason;
  constructor(reason: UnavailableReason, internalMessage?: string) {
    super(internalMessage ?? reason);
    this.name = "SourceUnavailableError";
    this.reason = reason;
  }
}

/**
 * Map an HTTP status to a reason category. Every collector uses this so that
 * "the upstream refused us" reads the same whichever source it came from,
 * instead of one collector calling a 403 blocked and another calling it a
 * generic upstream error.
 */
export function reasonForStatus(status: number): UnavailableReason {
  if (status === 401 || status === 403) return "blocked";
  if (status === 429) return "rate_limited";
  if (status === 404) return "no_results";
  if (status >= 500) return "upstream_error";
  return "upstream_error";
}

/** Map any thrown value to a reason category using only shape/status cues. */
export function classifyError(err: unknown): UnavailableReason {
  if (err instanceof SourceUnavailableError) return err.reason;

  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (/\b(401|403)\b/.test(lower) || lower.includes("forbidden") || lower.includes("unauthorized")) return "blocked";
  if (/\b429\b/.test(lower) || lower.includes("rate limit") || lower.includes("too many requests")) return "rate_limited";
  if (lower.includes("abort") || lower.includes("timed out") || lower.includes("timeout")) return "timeout";
  if (lower.includes("enotfound") || lower.includes("econnrefused") || lower.includes("econnreset") || lower.includes("fetch failed"))
    return "network";
  if (lower.includes("not configured") || lower.includes("missing api key")) return "not_configured";
  return "upstream_error";
}

export function reasonCopy(reason: UnavailableReason): { headline: string; detail: string } {
  return REASON_COPY[reason];
}

/**
 * Belt-and-braces scrub for any string that is about to be shown to a user.
 * Even though messages come from the fixed table above, run everything through
 * this so a future edit can't reintroduce a leak: SCREAMING_SNAKE tokens (the
 * shape of every env var name) and URLs are replaced, not printed.
 */
export function scrubForDisplay(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "[url]")
    .replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){1,}\b/g, "[redacted]")
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[redacted]")
    .trim();
}
