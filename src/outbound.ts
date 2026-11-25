/**
 * One helper for every outbound fetch in this Worker (Phase 2, 504 fix).
 *
 * Un-timed-out outbound calls were hanging requests and wedging Worker
 * capacity — the 504s showed 10x wall time against flat CPU with zero
 * Worker exceptions — so every call to another service goes through
 * fetchWithTimeout, and a timeout is logged as a named `upstream_timeout`
 * event instead of hanging silently.
 *
 * Deliberately NOT routed here:
 * - env.ASSETS.fetch — the local static-asset binding, not an outbound
 *   call; it cannot hang on an upstream.
 * - the fetch() in the client-side template in src/business-pages.ts —
 *   that code runs in the visitor's browser, not in this Worker.
 */

export const UPSTREAM_TIMEOUT_MS = 5000;
/** Shorter cap for status/probe-style calls (Turnstile verify). */
export const STATUS_TIMEOUT_MS = 2000;
/** Site reads already used a 7s cap before Phase 2; keep it. */
export const SITE_READ_TIMEOUT_MS = 7000;

/** The only way this Worker fetches another service. */
export function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, ms: number = UPSTREAM_TIMEOUT_MS): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(ms) });
}

export function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}

/** Single-line JSON log so Workers Logs can be queried by event name. */
export function logJson(event: string, fields: Record<string, unknown> = {}): void {
  try {
    console.error(JSON.stringify({ event, ...fields }));
  } catch {
    // Logging must never throw.
  }
}

/** The log line that names the hanging upstream. Never includes secrets or request bodies. */
export function logUpstreamTimeout(upstream: string, timeoutMs: number, extra: Record<string, unknown> = {}): void {
  logJson("upstream_timeout", { upstream, timeout_ms: timeoutMs, ...extra });
}
