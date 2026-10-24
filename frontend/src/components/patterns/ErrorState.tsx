import * as React from 'react';
import { errorMessageOf } from './errorMessage';
import { cn } from '../../lib/utils';

/**
 * The "this failed" state, with a way back.
 *
 * An error state that only displays the error string is a dead end: the user
 * reads it, understands nothing, and reloads the whole page. This one offers a
 * retry whenever the caller can supply one, and puts the technical detail
 * behind a disclosure so the message stays useful to a non-technical operator
 * without hiding the cause from support.
 */
export interface ErrorStateProps {
  /** What failed, in plain language. */
  title?: string;
  /**
   * The underlying message. Shown inside a <details> so it is available for
   * support without dominating the screen.
   */
  error?: unknown;
  /** Invoked by the retry button. When absent, no retry button is rendered. */
  onRetry?: () => void;
  /** Set while a retry is in flight, so the button cannot be double-fired. */
  retrying?: boolean;
  className?: string;
}


export function ErrorState({
  title = 'Something went wrong',
  error,
  onRetry,
  retrying = false,
  className,
}: ErrorStateProps) {
  const detail = errorMessageOf(error);

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-6 py-10 text-center',
        className,
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500/15 text-red-300">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        </svg>
      </div>

      <p className="text-sm font-medium text-white">{title}</p>

      {detail ? (
        <details className="max-w-md text-left">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-300">
            Technical details
          </summary>
          <p className="mt-2 break-words rounded bg-black/30 p-2 font-mono text-xs text-slate-400">
            {detail}
          </p>
        </details>
      ) : null}

      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-1 inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
        >
          {retrying ? 'Retrying…' : 'Try again'}
        </button>
      ) : null}
    </div>
  );
}

ErrorState.displayName = 'ErrorState';
