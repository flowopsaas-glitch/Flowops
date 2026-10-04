import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * A single KPI tile.
 *
 * Two things this does that the hand-rolled versions did not. The trend arrow
 * is `aria-hidden` and carries a text equivalent, so the direction is not
 * conveyed by colour and glyph alone. And the card is clickable as a real
 * button when an `onClick` is supplied — the previous pattern of attaching
 * onClick to the wrapping div was one of the 35 keyboard-inaccessible
 * interactive elements found in the audit.
 */
export interface StatCardProps {
  label: string;
  /** Pre-formatted value. Formatting belongs to the caller, not here. */
  value: React.ReactNode;
  /** Context under the value: a comparison period, a target, a note. */
  hint?: string;
  /** Percentage change. Sign drives the arrow; magnitude is shown as given. */
  delta?: number | null;
  /**
   * Whether a rising number is good. Defaults to true; pass false for metrics
   * where up is bad (delays, disputes, cost) so the colour is not backwards.
   */
  higherIsBetter?: boolean;
  icon?: React.ReactNode;
  onClick?: () => void;
  isLoading?: boolean;
  className?: string;
}

function DeltaBadge({ delta, higherIsBetter }: { delta: number; higherIsBetter: boolean }) {
  const rising = delta > 0;
  const good = rising === higherIsBetter;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium',
        good ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300',
      )}
    >
      {/* Decorative: the sign is already in the text, so the glyph is hidden. */}
      <span aria-hidden="true">{rising ? '↑' : '↓'}</span>
      <span>
        {rising ? '+' : ''}
        {delta}%
      </span>
      <span className="sr-only">
        {good ? 'improved' : 'worsened'} by {Math.abs(delta)} percent
      </span>
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  delta,
  higherIsBetter = true,
  icon,
  onClick,
  isLoading = false,
  className,
}: StatCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        {icon ? <span className="text-slate-500">{icon}</span> : null}
      </div>

      {isLoading ? (
        <div className="mt-2 h-7 w-24 animate-pulse rounded bg-white/10" aria-hidden="true" />
      ) : (
        <div className="mt-1 flex items-baseline gap-2">
          <p className="text-2xl font-semibold tabular-nums text-white">{value}</p>
          {delta != null && !Number.isNaN(delta) ? (
            <DeltaBadge delta={delta} higherIsBetter={higherIsBetter} />
          ) : null}
        </div>
      )}

      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </>
  );

  const shell = cn(
    'rounded-lg border border-white/10 bg-white/[0.03] p-4 text-left',
    onClick && 'transition hover:border-white/20 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40',
    className,
  );

  // A real button, so Enter and Space work and the focus ring is visible.
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={shell}>
        {body}
      </button>
    );
  }

  return <div className={shell}>{body}</div>;
}

StatCard.displayName = 'StatCard';
