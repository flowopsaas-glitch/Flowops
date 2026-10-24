import * as React from 'react';
import type { StatusTone } from './statusTone';
import { cn } from '../../lib/utils';

/**
 * A status pill with a fixed semantic palette.
 *
 * Status colours were previously chosen per page, so the same status could be
 * amber on one screen and red on another. Fixing the palette here means a
 * status reads the same everywhere it appears.
 *
 * Colour is never the only signal: every variant is paired with a dot AND the
 * label text, so the state survives greyscale and colour-blind viewing.
 */

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: 'bg-white/10 text-slate-300 ring-white/15',
  info: 'bg-sky-500/15 text-sky-300 ring-sky-400/30',
  success: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
  warning: 'bg-amber-500/15 text-amber-300 ring-amber-400/30',
  danger: 'bg-red-500/15 text-red-300 ring-red-400/30',
  critical: 'bg-red-600/25 text-red-200 ring-red-500/40',
};

const DOT_CLASS: Record<StatusTone, string> = {
  neutral: 'bg-slate-400',
  info: 'bg-sky-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  danger: 'bg-red-400',
  critical: 'bg-red-500',
};

export interface StatusBadgeProps {
  /** The visible word or phrase. */
  children: React.ReactNode;
  tone?: StatusTone;
  /** Hide the dot for dense tables where it costs more than it adds. */
  showDot?: boolean;
  className?: string;
}

export function StatusBadge({
  children,
  tone = 'neutral',
  showDot = true,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONE_CLASS[tone],
        className,
      )}
    >
      {showDot ? (
        <span className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASS[tone])} aria-hidden="true" />
      ) : null}
      {children}
    </span>
  );
}


StatusBadge.displayName = 'StatusBadge';
