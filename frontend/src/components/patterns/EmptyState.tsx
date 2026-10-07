import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * The "nothing here yet" state.
 *
 * Only 16 of the 80 pages in this app had any empty state at all, which means
 * most of them rendered a blank panel when a list came back empty —
 * indistinguishable from a broken page. This exists so that the empty case is
 * the easiest thing to reach for rather than the easiest thing to forget.
 *
 * It is deliberately not just a message: an empty state is the one moment a
 * new user is paying full attention and has nothing to look at, so it carries
 * an action whenever there is a sensible one.
 */
export interface EmptyStateProps {
  /** Short, plain statement of what is absent. Not "No data available". */
  title: string;
  /** One sentence: why it is empty, or what to do about it. */
  description?: string;
  /** Rendered above the title. Pass an icon element, not an icon name. */
  icon?: React.ReactNode;
  /** The primary way out of the empty state. */
  action?: React.ReactNode;
  /**
   * `panel` fills its container (the common case for a list inside a card).
   * `inline` is a tighter block for use inside an existing panel.
   */
  variant?: 'panel' | 'inline';
  className?: string;
  /** Announce changes to screen readers when content arrives. */
  live?: boolean;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  variant = 'panel',
  className,
  live = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-center',
        variant === 'panel'
          ? 'rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-6 py-12'
          : 'px-6 py-8',
        className,
      )}
      // An empty result is usually the outcome of a search or filter change, so
      // it is announced rather than silently swapped in.
      aria-live={live ? 'polite' : undefined}
    >
      {icon ? (
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5 text-slate-400">
          {icon}
        </div>
      ) : null}

      <div className="space-y-1">
        <p className="text-sm font-medium text-white">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-slate-400">{description}</p>
        ) : null}
      </div>

      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

EmptyState.displayName = 'EmptyState';
