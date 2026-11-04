/**
 * The paths excluded from the `api/v1` global prefix.
 *
 * This is a shared constant rather than an inline array in `main.ts` because
 * getting it wrong is silent: the route simply 404s in production while every
 * unit test still passes. `public-health.controller.route.spec.ts` boots a real
 * Nest app with these exact values and asserts the resulting paths.
 *
 * ── The trap ────────────────────────────────────────────────────────────────
 * The exclude list matches *route paths*, not controllers. A controller
 * declared as `@Controller('health')` produces the route path `health`, which
 * is excluded — so it lands on `/health` next to the internal probe instead of
 * `/api/v1/health`, and the two collide. That is why the public controller has
 * to declare the full path `api/v1/health` and be excluded explicitly: its
 * route path then already contains the prefix, and excluding it stops Nest
 * from producing `/api/v1/api/v1/health`.
 */
export const GLOBAL_PREFIX_EXCLUDE = [
  /** Internal probe: Docker HEALTHCHECK, compose, deploy script, CI. */
  '/health',
  /** Public probe: the only health URL nginx proxies. */
  '/api/v1/health',
  /** Webhooks declare their own full path; the prefix would double it. */
  '/api/v1/whatsapp/webhook',
  '/api/v1/paystack/webhook',
] as const;
