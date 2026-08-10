import { lazy, ComponentType } from 'react';

/**
 * Lazy import with automatic retry on chunk load failure.
 *
 * When a deploy invalidates old JS chunks, users on the old version
 * get a "ChunkLoadError" when navigating to a new page. This wrapper
 * retries the import once and forces a page reload on the second failure.
 *
 * Usage:
 *   const Dashboard = lazyRetry(() => import("./pages/Dashboard"));
 */
export function lazyRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    const hasRefreshed = sessionStorage.getItem('chunk-retry') === 'true';

    try {
      const component = await importFn();
      sessionStorage.removeItem('chunk-retry');
      return component;
    } catch (error: any) {
      if (!hasRefreshed && error?.name === 'ChunkLoadError') {
        sessionStorage.setItem('chunk-retry', 'true');
        window.location.reload();
        // Return a dummy to satisfy TypeScript while reload happens
        return { default: (() => null) as any };
      }
      throw error;
    }
  });
}
