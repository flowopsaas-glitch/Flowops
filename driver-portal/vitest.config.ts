import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * The driver portal is the offline half of the truck-window loop: a driver in a
 * notspot confirms a gate window, the confirmation queues, and the flush has to
 * be honest about what the server said — including when the answer is "that
 * version was superseded while you were offline". That behaviour is only worth
 * anything if it is tested, so this app now has the same runner the frontend
 * uses (vitest + jsdom + Testing Library), with real IndexedDB via
 * fake-indexeddb so the outbox under test is the outbox that ships.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
