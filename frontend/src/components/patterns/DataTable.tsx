import * as React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { cn } from '../../lib/utils';
import { AsyncState, TableSkeleton } from './AsyncState';
import { EmptyState, type EmptyStateProps } from './EmptyState';
import { Pagination } from './Pagination';

/**
 * A typed table with the four states and pagination built in.
 *
 * Only 7 of 80 pages used the shared table primitive; the rest composed tables
 * inline, which is why loading, empty and error handling varied so widely. This
 * makes the complete version the shortest thing to write.
 *
 * Sorting is client-side and optional: pass `sortable` on a column and a
 * `sort` accessor. Server-side sorting stays with the caller via `onSortChange`
 * so this never silently reorders a paginated server result.
 */

export interface Column<Row> {
  /** Stable id, used as the React key and the sort identifier. */
  id: string;
  header: React.ReactNode;
  /** Cell renderer. Keep it pure — it is called on every render. */
  cell: (row: Row) => React.ReactNode;
  /** Enables the header sort control. */
  sortable?: boolean;
  /** Value used for sorting. Falls back to the rendered text when absent. */
  sortValue?: (row: Row) => string | number;
  className?: string;
  headerClassName?: string;
  /** Hide below a breakpoint, e.g. `hidden md:table-cell`. */
  responsiveClassName?: string;
}

export interface DataTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  /** Required for stable keys. Return a string id per row. */
  rowKey: (row: Row) => string;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Overrides the default empty state. */
  empty?: Omit<EmptyStateProps, 'live'>;
  /** Makes rows interactive. Rows become focusable and keyboard-activatable. */
  onRowClick?: (row: Row) => void;
  /**
   * Accessible name for a clickable row, e.g. "Open deviation NS-0412".
   * Falls back to a generic label, so supply this wherever the row identity
   * matters — a screen reader user should hear which record they are opening.
   */
  rowActionLabel?: (row: Row) => string;
  /** Highlights the row whose key matches. */
  selectedKey?: string | null;

  // ── Pagination (all optional; omit for a plain list) ──
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;

  /** Called when a sortable header is activated. Omit to sort locally. */
  onSortChange?: (columnId: string, direction: 'asc' | 'desc') => void;
  initialSort?: { columnId: string; direction: 'asc' | 'desc' };

  className?: string;
  /** Vertical density. */
  density?: 'comfortable' | 'compact';
  /** Accessible name, since a page often holds more than one table. */
  label?: string;
}

function compare(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  isLoading = false,
  error,
  onRetry,
  empty,
  onRowClick,
  rowActionLabel,
  selectedKey,
  page,
  pageSize,
  total,
  onPageChange,
  onSortChange,
  initialSort,
  className,
  density = 'comfortable',
  label,
}: DataTableProps<Row>) {
  const [sort, setSort] = React.useState(initialSort ?? null);

  // Local sorting only when the caller has not asked to handle it — sorting a
  // server-paginated page locally would reorder just the current page.
  const serverSorted = Boolean(onSortChange);
  const sortedRows = React.useMemo(() => {
    if (!sort || serverSorted) return rows;
    const col = columns.find((c) => c.id === sort.columnId);
    if (!col?.sortable) return rows;
    const valueOf = col.sortValue;
    if (!valueOf) return rows;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => compare(valueOf(a), valueOf(b)) * dir);
  }, [rows, sort, columns, serverSorted]);

  const toggleSort = (col: Column<Row>) => {
    if (!col.sortable) return;
    const next: { columnId: string; direction: 'asc' | 'desc' } =
      sort?.columnId === col.id
        ? { columnId: col.id, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
        : { columnId: col.id, direction: 'asc' };
    setSort(next);
    onSortChange?.(next.columnId, next.direction);
  };

  const showPagination = onPageChange && page && pageSize && total !== undefined && total > pageSize;
  // Never show "no records" mid-fetch; that flash is what makes an app feel slow.
  const isEmpty = !isLoading && !error && sortedRows.length === 0;

  return (
    <div className={cn('space-y-3', className)}>
      <AsyncState
        isLoading={isLoading}
        error={error}
        isEmpty={isEmpty}
        onRetry={onRetry}
        loadingFallback={<TableSkeleton rows={Math.min(pageSize ?? 6, 8)} columns={columns.length} />}
        empty={empty}
      >
        <div className="overflow-hidden rounded-lg border border-white/10">
          <div className="overflow-x-auto">
            <Table aria-label={label}>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  {columns.map((col) => {
                    const active = sort?.columnId === col.id;
                    return (
                      <TableHead
                        key={col.id}
                        className={cn(
                          'whitespace-nowrap text-xs font-medium uppercase tracking-wide text-slate-400',
                          col.headerClassName,
                          col.responsiveClassName,
                        )}
                        aria-sort={
                          col.sortable
                            ? active
                              ? sort.direction === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                            : undefined
                        }
                      >
                        {col.sortable ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(col)}
                            className="inline-flex items-center gap-1 rounded transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
                          >
                            {col.header}
                            <span aria-hidden="true" className={cn('text-[10px]', active ? 'text-sky-300' : 'text-slate-600')}>
                              {active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
                            </span>
                          </button>
                        ) : (
                          col.header
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>

              <TableBody>
                {sortedRows.map((row) => {
                  const key = rowKey(row);
                  const selected = selectedKey === key;
                  return (
                    <TableRow
                      key={key}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      // Focusable and keyboard-operable, but the row KEEPS its
                      // implicit `row` role. Overriding it with role="button"
                      // removes the row from the accessibility tree, which
                      // breaks the association between every cell and its
                      // column header — the table stops being a table for a
                      // screen reader. A focusable row inside a table is the
                      // accepted pattern; a re-roled one is not.
                      tabIndex={onRowClick ? 0 : undefined}
                      aria-label={
                        onRowClick
                          ? (rowActionLabel?.(row) ?? `${key} — activate for details`)
                          : undefined
                      }
                      onKeyDown={
                        onRowClick
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onRowClick(row);
                              }
                            }
                          : undefined
                      }
                      className={cn(
                        'border-white/5',
                        onRowClick &&
                          'cursor-pointer hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400/40',
                        selected && 'bg-sky-500/10',
                      )}
                    >
                      {columns.map((col) => (
                        <TableCell
                          key={col.id}
                          className={cn(
                            'text-sm text-slate-200',
                            density === 'compact' ? 'py-1.5' : 'py-3',
                            col.className,
                            col.responsiveClassName,
                          )}
                        >
                          {col.cell(row)}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </AsyncState>

      {showPagination ? (
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />
      ) : null}
    </div>
  );
}

DataTable.displayName = 'DataTable';
export { EmptyState };
