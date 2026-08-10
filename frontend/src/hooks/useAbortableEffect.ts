import { useEffect, useRef, DependencyList } from 'react';

/**
 * useEffect with built-in AbortController — prevents state updates on unmounted components.
 *
 * Usage:
 *   useAbortableEffect((signal) => {
 *     const res = await fetch('/api/data', { signal });
 *     setData(res);
 *   }, [dependency]);
 *
 * The signal is automatically aborted when:
 * - The component unmounts
 * - The effect re-runs (deps change)
 */
export function useAbortableEffect(
  effect: (signal: AbortSignal) => void | Promise<void>,
  deps: DependencyList,
) {
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Abort previous run
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Run the effect
    const result = effect(controller.signal);

    // If effect returns a promise, catch abort errors silently
    if (result && typeof (result as Promise<void>).catch === 'function') {
      (result as Promise<void>).catch((err) => {
        if (err?.name !== 'AbortError') throw err;
      });
    }

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
