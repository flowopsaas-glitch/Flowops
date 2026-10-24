/**
 * Composed patterns built on the primitives in ../ui.
 *
 * ../ui holds unopinionated primitives (a button, a table cell). This directory
 * holds opinionated compositions that encode how this application does things:
 * what an empty list says, how a destructive action is confirmed, what the top
 * of a page looks like.
 *
 * Everything here is keyboard-operable and announces its state, because the
 * alternatives were what the accessibility audit flagged: clickable divs,
 * colour-only status, and error messages with no way to retry.
 */

export { AsyncState, ListSkeleton, TableSkeleton } from './AsyncState';
export type { AsyncStateProps } from './AsyncState';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { ErrorState } from './ErrorState';
export { errorMessageOf } from './errorMessage';

export { useDismissOnEscape } from './useDismissOnEscape';
export type { ErrorStateProps } from './ErrorState';

export { PageHeader } from './PageHeader';
export type { PageHeaderProps } from './PageHeader';

export { StatCard } from './StatCard';
export type { StatCardProps } from './StatCard';

export { StatusBadge } from './StatusBadge';
export { statusToneFor } from './statusTone';
export type { StatusTone } from './statusTone';
export type { StatusBadgeProps } from './StatusBadge';

export { Pagination } from './Pagination';
export { pageWindow } from './pageWindow';
export type { PaginationProps } from './Pagination';

export { DataTable } from './DataTable';
export type { Column, DataTableProps } from './DataTable';

export { ConfirmDialog } from './ConfirmDialog';
export type { ConfirmDialogProps } from './ConfirmDialog';
