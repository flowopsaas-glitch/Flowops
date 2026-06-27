import * as Sentry from '@sentry/node';

let enabled = false;

/**
 * Initialise Sentry for the backend. No-op (and safe) when SENTRY_DSN is unset,
 * so dev and self-hosted installs without Sentry keep working unchanged.
 * Call this as early as possible in bootstrap().
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.APP_VERSION || undefined,
    // Capture a slice of traces in prod for performance insight; full in dev.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
  enabled = true;
}

export function isSentryEnabled(): boolean {
  return enabled;
}

/**
 * Report an unexpected error to Sentry with request context. Never throws —
 * error reporting must not become a source of errors.
 */
export function reportToSentry(exception: unknown, context?: Record<string, any>): void {
  if (!enabled) return;
  try {
    Sentry.withScope((scope) => {
      if (context) scope.setExtras(context);
      Sentry.captureException(exception);
    });
  } catch {
    /* swallow */
  }
}
