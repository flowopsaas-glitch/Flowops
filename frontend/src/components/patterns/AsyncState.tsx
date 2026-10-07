import * as React from 'react';
import { Skeleton } from '../ui/skeleton';
import { EmptyState, type EmptyStateProps } from './EmptyState';
import { ErrorState } from './ErrorState';

/**
 * One component for the four states of any fetched view.
 *
 * The audit of this app found 60 of 80 pages handling a loading state and 64
 * mentioning errors, but only 16 handling the empty case — and each page wrote
 * its own combination of the three. That is why the same view could show a
 * spinner in one place and nothing at all in another.
 *
 * This collapses the decision to one call site. A page either has data, or it
 * is in exactly one of loading / error / empty, and it cannot silently fall
 * through all three and render a blank panel.
 *
 * The order matters and is deliberate: error wins over empty, because an empty
 * list caused by a failed request must not be presented as "no records".
 */
export interface AsyncStateProps {
  isLoading?: boolean;
  error?: unknown;
  /** True when the request succeeded but produced no rows. */
  isEmpty?: boolean;
  /** Rendered while loading. Defaults to a skeleton block. */
  loadingFallback?: React.ReactNode;
  /** Props for the empty state; `title` is required when `isEmpty` is true. */
  empty?: Omit<EmptyStateProps, 'live'>;
  /** Enables retry in the error state. */
  onRetry?: () => void;
  retrying?: boolean;
  errorTitle?: string;
  children: React.ReactNode;
}

/** A neutral placeholder that holds roughly the height of a short list. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

/** Placeholder shaped like a table with a header row. */
export function TableSkeleton({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-2">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-10 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function AsyncState({
  isLoading = false,
  error,
  isEmpty = false,
  loadingFallback,
  empty,
  onRetry,
  retrying,
  errorTitle,
  children,
}: AsyncStateProps) {
  if (isLoading) {
    return <>{loadingFallback ?? <ListSkeleton />}</>;
  }

  // Only treat it as an error when there is something to report; `error` is
  // commonly left as a stale value from a previous failed call.
  if (error) {
    return <ErrorState title={errorTitle} error={error} onRetry={onRetry} retrying={retrying} />;
  }

  if (isEmpty) {
    return <EmptyState {...empty} title={empty?.title ?? 'Nothing here yet'} />;
  }

  return <>{children}</>;
}

AsyncState.displayName = 'AsyncState';
export { EmptyState, ErrorState };
