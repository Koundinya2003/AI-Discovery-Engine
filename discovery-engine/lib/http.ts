// Shared network-hardening helpers used by every collector so timeout and
// retry behavior is consistent instead of each collector reimplementing it
// (only forums.ts had a timeout before this existed).

export async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Retry a fallible async operation once on failure, with a short fixed
 * backoff. Deliberately one retry, not a loop or exponential backoff — this
 * mirrors the Groq client's "exactly one retry" philosophy and keeps worst-
 * case collector latency bounded within the serverless function's time budget.
 */
export async function withRetry<T>(fn: () => Promise<T>, backoffMs = 500): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((r) => setTimeout(r, backoffMs));
    return fn();
  }
}
