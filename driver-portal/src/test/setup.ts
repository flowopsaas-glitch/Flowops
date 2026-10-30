import '@testing-library/jest-dom/vitest';
// Real IndexedDB in jsdom, so Dexie (the offline outbox) is exercised as it
// ships rather than being replaced by a stub that agrees with the test.
import 'fake-indexeddb/auto';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// The portal is a PWA: matchMedia, service-worker registration and the
// connectivity events are all used at module scope by real components.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

if (!('serviceWorker' in navigator)) {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { register: vi.fn(async () => undefined), ready: Promise.resolve(undefined) },
    configurable: true,
  });
}

// jsdom does not implement scrollTo; the portal calls it after navigation.
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
