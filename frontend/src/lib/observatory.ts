/**
 * CLAW Observatory — frontend error reporter.
 *
 * Posts runtime JS errors to FlowOps's own backend (self-hosted, not a third
 * party) where CLAW groups + AI-triages them. Fire-and-forget, throttled, and
 * deduped so it never loops or floods. Disabled on localhost.
 */
import { FLOWOPS_API_URL } from "./env";

let sentInWindow = 0;
let windowResetAt = 0;
const recent = new Set<string>();
const MAX_PER_MINUTE = 20;

function shouldSend(key: string): boolean {
  if (typeof window !== "undefined" && /localhost|127\.0\.0\.1/.test(window.location.hostname)) {
    return false;
  }
  const now = Date.now();
  if (now > windowResetAt) {
    windowResetAt = now + 60_000;
    sentInWindow = 0;
    recent.clear();
  }
  if (recent.has(key)) return false; // already reported this exact error this minute
  if (sentInWindow >= MAX_PER_MINUTE) return false;
  recent.add(key);
  sentInWindow += 1;
  return true;
}

export function reportClientError(
  message: string,
  stack?: string,
  level: "error" | "warning" = "error",
): void {
  try {
    const msg = String(message || "").slice(0, 2000);
    if (!msg) return;
    const key = `${msg}|${(stack || "").slice(0, 120)}`;
    if (!shouldSend(key)) return;

    const body = JSON.stringify({
      message: msg,
      stack: stack ? String(stack).slice(0, 8000) : undefined,
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
      level,
    });

    // keepalive lets the report survive a page unload/navigation.
    void fetch(`${FLOWOPS_API_URL}/observability/client-error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* reporting must never throw */
  }
}

/** Attach global handlers for uncaught errors + unhandled promise rejections. */
export function initObservatory(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (e: ErrorEvent) => {
    reportClientError(e.message || "Uncaught error", e.error?.stack);
  });

  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const reason: { message?: string; stack?: string } | null = (e.reason ?? null) as { message?: string; stack?: string } | null;
    const message = reason?.message || String(reason) || "Unhandled promise rejection";
    reportClientError(`Unhandled rejection: ${message}`, reason?.stack);
  });
}
