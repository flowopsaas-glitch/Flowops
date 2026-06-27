/**
 * FlowOps clone tripwire (frontend).
 *
 * A public web UI is inherently copyable — this does NOT try to stop a clone.
 * Instead, when the FlowOps bundle is served from a host that is not on the
 * canonical allow-list, it fires a one-shot, fire-and-forget beacon to our own
 * canonical backend (CLAW Observatory) so the owner is alerted that a verbatim
 * copy of the build is live somewhere unexpected.
 *
 * Why an absolute GET (not the app's relative API URL):
 *  - A cloned bundle's relative API base would hit the *clone's* own server,
 *    which is useless. We must phone home to FlowOps's canonical domain.
 *  - A cross-origin POST of JSON triggers a CORS preflight that the backend
 *    (origin-locked) would reject. A simple cross-origin GET has no preflight,
 *    so it reaches the server even though we can't read the (opaque) response.
 *
 * Configurable via:
 *   VITE_CANONICAL_HOSTS      comma-separated allowed host suffixes
 *   VITE_INTEGRITY_BEACON_URL absolute API base of the canonical backend
 */
const env: Record<string, string | undefined> = (import.meta as any).env || {};

const DEFAULT_ALLOWED = ["flowop.work", "localhost", "127.0.0.1"];
const DEFAULT_BEACON_BASE = "https://app.flowop.work/api/v1";

function allowedSuffixes(): string[] {
  const configured = (env.VITE_CANONICAL_HOSTS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_ALLOWED;
}

function isCanonicalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return allowedSuffixes().some(
    (suffix) => h === suffix || h.endsWith(`.${suffix}`) || h.endsWith(suffix),
  );
}

/**
 * Check the serving host once on boot. If it is not recognised, beacon home.
 * Never throws; never blocks the app.
 */
export function initIntegrityTripwire(): void {
  try {
    if (typeof window === "undefined") return;
    const host = window.location.hostname || "";
    // Skip local dev and the legitimate domains.
    if (!host || isCanonicalHost(host)) return;

    const base = (env.VITE_INTEGRITY_BEACON_URL || DEFAULT_BEACON_BASE).replace(/\/$/, "");
    const params = new URLSearchParams({
      host,
      origin: window.location.origin,
      ref: document.referrer || "",
      buildId: env.VITE_APP_VERSION || "unknown",
      path: window.location.pathname,
    });
    const url = `${base}/observability/integrity-beacon?${params.toString()}`;

    // Primary: simple cross-origin GET (no preflight). Response is opaque — fine.
    void fetch(url, { method: "GET", mode: "no-cors", keepalive: true, credentials: "omit" }).catch(
      () => {
        // Fallback: tracking-pixel style GET, immune to fetch/CSP quirks.
        try {
          new Image().src = url;
        } catch {
          /* ignore */
        }
      },
    );
  } catch {
    /* tripwire must never throw */
  }
}
