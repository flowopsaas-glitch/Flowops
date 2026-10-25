import * as React from 'react';
import { pageWindow } from './pageWindow';
import { cn } from '../../lib/utils';

/**
 * Page controls for a paginated list.
 *
 * No page in this app had shared pagination; each list that needed it built its
 * own, and most simply did not. The controls are real buttons, the current page
 * is identified with `aria-current`, and the summary line tells a screen reader
 * where it is without relying on the button labels alone.
 */
export interface PaginationProps {
  page: number;
  /** Total pages. When omitted, only prev/next are shown. */
  pageCount?: number;
  onPageChange: (page: number) => void;
  /** Total records, for the "showing X of Y" line. */
  total?: number;
  pageSize?: number;
  className?: string;
  disabled?: boolean;
}


export function Pagination({
  page,
  pageCount,
  onPageChange,
  total,
  pageSize,
  className,
  disabled = false,
}: PaginationProps) {
  const last = pageCount ?? (pageSize && total ? Math.max(1, Math.ceil(total / pageSize)) : undefined);
  const canPrev = !disabled && page > 1;
  const canNext = !disabled && last !== undefined && page < last;

  const range =
    total !== undefined && pageSize
      ? (() => {
          const from = (page - 1) * pageSize + 1;
          const to = Math.min(page * pageSize, total);
          return total === 0 ? 'No records' : `${from}–${to} of ${total}`;
        })()
      : undefined;

  const btn =
    'inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white transition hover:bg-white/10 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40';

  return (
    <nav
      className={cn('flex flex-wrap items-center justify-between gap-3', className)}
      aria-label="Pagination"
    >
      {range ? <p className="text-xs text-slate-400">{range}</p> : <span />}

      <div className="flex items-center gap-1">
        <button
          type="button"
          className={btn}
          onClick={() => onPageChange(page - 1)}
          disabled={!canPrev}
          aria-label="Previous page"
        >
          <span aria-hidden="true">‹</span>
        </button>

        {last !== undefined
          ? pageWindow(page, last).map((p, i) =>
              p === 'gap' ? (
                <span key={`gap-${i}`} className="px-1 text-slate-500" aria-hidden="true">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  className={cn(
                    btn,
                    p === page && 'border-sky-400/40 bg-sky-500/20 text-sky-200',
                  )}
                  onClick={() => onPageChange(p)}
                  disabled={disabled}
                  aria-current={p === page ? 'page' : undefined}
                  aria-label={`Page ${p}`}
                >
                  {p}
                </button>
              ),
            )
          : (
            <span className="px-2 text-sm text-slate-300">Page {page}</span>
          )}

        <button
          type="button"
          className={btn}
          onClick={() => onPageChange(page + 1)}
          disabled={!canNext}
          aria-label="Next page"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </nav>
  );
}

Pagination.displayName = 'Pagination';
