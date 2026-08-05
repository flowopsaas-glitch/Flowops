# FlowOps — Security & Defensibility Posture

This document records the measures that make FlowOps hard to replicate or abuse,
and — honestly — the limits of each. A public web UI is inherently copyable; real
defensibility lives in server-side logic, data, and operational depth. The
controls below raise the bar and give fast visibility of clones/abuse.

## Tier 1 — Real moats (where the value is)
- **Server-side IP.** CLAW logic, the customs estimator, scoring/ranking and AI
  orchestration run only on the backend (NestJS). They are never shipped to the
  browser, so they cannot be read from the bundle.
- **Bundle leak guard.** `frontend/scripts/check-bundle-leak.mjs` runs during the
  Docker build and fails the build if any source map or server secret pattern
  (Stripe/Paystack/AWS/Groq keys, private keys, secret env assignments) is found
  in `dist/`. `VITE_*` values are intentionally public and are not flagged.
- **Data & network effects.** CLAW decision memory, competitive-intel history and
  accumulated ops data compound with use — a clone starts from zero.
- **SA-native regulatory depth.** Customs/VAT/SAD500 handling is hard to copy.

## Tier 2 — Hardening
- **API rate limiting** (`@nestjs/throttler`). Global backstop 600 req/60s per
  client; tight per-route limits on auth (login 10, register 5, refresh 30,
  forgot/reset 5 per min) and AI endpoints (20–30/min). Tracking resolves the
  real client behind Cloudflare/nginx (`ThrottlerProxyGuard`): per-user when
  authenticated, else `CF-Connecting-IP` / `X-Forwarded-For` / `req.ip`. Health
  and provider webhooks are exempt (`@SkipThrottle`).
- **Build hardening.** Production builds ship no source maps; `debugger` is
  dropped and chatty `console.*` is stripped (errors/warnings kept).
- **Clone tripwire.** When the bundle is served from a host not in
  `VITE_CANONICAL_HOSTS`, `initIntegrityTripwire()` fires a one-shot absolute GET
  to the canonical backend; it lands in the CLAW Observatory (`source:
  integrity`) so the owner is alerted to a verbatim clone. It cannot stop a
  clone — it provides visibility.
- **Scrape detection.** `ScrapeDetectorInterceptor` flags a principal making
  >700 authenticated reads / 5 min into the Observatory (non-blocking; the
  throttler does the blocking at a higher ceiling).

## Tier 3 — Legal
- Proprietary licence (`UNLICENSED` / all rights reserved).
- Terms of Service include an explicit acceptable-use, anti-scraping,
  anti-reverse-engineering, no-derivative/no-clone and trademark clause
  (`frontend/src/legal/termsSections.ts`, v1.1.0).

## Tier 4 — Reasonable anti-tamper only
- React DevTools hook neutralised in production; a console self-XSS warning is
  shown.
- **Deliberately NOT done:** heavy JS obfuscation, disabling right-click/DevTools,
  DRM-style anti-debug traps. These give false security, hurt our own debugging
  and bundle size, and are trivially bypassed by a motivated competitor.

## Tuning / configuration
- `VITE_CANONICAL_HOSTS` — comma-separated allowed host suffixes (default
  `flowop.work,localhost,127.0.0.1`).
- `VITE_INTEGRITY_BEACON_URL` — absolute API base of the canonical backend the
  tripwire reports to (default `https://app.flowop.work/api/v1`).
- Rate-limit numbers live in `backend/src/app.module.ts` and the per-route
  `@Throttle` decorators; scrape threshold in `scrape-detector.interceptor.ts`.
