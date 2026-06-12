import * as Sentry from '@sentry/react';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const ENV = import.meta.env.MODE || 'development';

export function initSentry() {
  if (!SENTRY_DSN) {
    if (import.meta.env.DEV) {
      console.info('[Sentry] No VITE_SENTRY_DSN set — error tracking disabled');
    }
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENV,
    release: import.meta.env.VITE_APP_VERSION || '0.0.0',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    tracesSampleRate: ENV === 'production' ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event) {
      // Don't send events from localhost
      if (window.location.hostname === 'localhost') return null;
      return event;
    },
  });
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  Sentry.captureException(error, { extra: context });
}

export function setUser(id: string, email?: string, role?: string) {
  Sentry.setUser({ id, email, username: role });
}

export function clearUser() {
  Sentry.setUser(null);
}
