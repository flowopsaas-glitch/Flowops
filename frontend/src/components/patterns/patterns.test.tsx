import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EmptyState } from './EmptyState';
import { ErrorState, errorMessageOf } from './ErrorState';
import { AsyncState } from './AsyncState';
import { StatCard } from './StatCard';
import { StatusBadge, statusToneFor } from './StatusBadge';
import { Pagination, pageWindow } from './Pagination';
import { DataTable } from './DataTable';
import { ConfirmDialog } from './ConfirmDialog';

describe('EmptyState', () => {
  it('states what is absent and offers a way out', () => {
    render(
      <EmptyState
        title="No handshake reports yet"
        description="The first report arrives once the IM issues the daily reconciliation."
        action={<button>Create manually</button>}
      />,
    );
    expect(screen.getByText('No handshake reports yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create manually' })).toBeTruthy();
  });

  it('announces itself politely when asked, so a filtered-out result is not silent', () => {
    const { container } = render(<EmptyState title="None" live />);
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
  });
});

describe('ErrorState', () => {
  it('is announced as an alert', () => {
    render(<ErrorState error="boom" />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('offers a retry only when the caller can retry', () => {
    const { rerender } = render(<ErrorState error="boom" />);
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    const onRetry = vi.fn();
    rerender(<ErrorState error="boom" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('cannot be double-fired while a retry is in flight', () => {
    const onRetry = vi.fn();
    render(<ErrorState error="boom" onRetry={onRetry} retrying />);
    const btn = screen.getByRole('button', { name: /retrying/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps the technical detail available but out of the way', () => {
    render(<ErrorState error="connect ECONNREFUSED" />);
    expect(screen.getByText('Technical details')).toBeTruthy();
    expect(screen.getByText('connect ECONNREFUSED')).toBeTruthy();
  });
});

describe('errorMessageOf', () => {
  it('unwraps the shapes an API actually returns', () => {
    expect(errorMessageOf('plain')).toBe('plain');
    expect(errorMessageOf(new Error('from error'))).toBe('from error');
    expect(errorMessageOf({ response: { data: { message: 'server says' } } })).toBe('server says');
    expect(errorMessageOf({ message: 'direct' })).toBe('direct');
    expect(errorMessageOf(null)).toBe('');
  });
});

describe('AsyncState', () => {
  it('prefers the error over the empty state, so a failed request never reads as "no records"', () => {
    render(
      <AsyncState error="down" isEmpty>
        <div>content</div>
      </AsyncState>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText('content')).toBeNull();
  });

  it('shows the empty state when the request succeeded with no rows', () => {
    render(
      <AsyncState isEmpty empty={{ title: 'Nothing logged' }}>
        <div>content</div>
      </AsyncState>,
    );
    expect(screen.getByText('Nothing logged')).toBeTruthy();
    expect(screen.queryByText('content')).toBeNull();
  });

  it('renders children when there is data', () => {
    render(
      <AsyncState>
        <div>content</div>
      </AsyncState>,
    );
    expect(screen.getByText('content')).toBeTruthy();
  });

  it('shows a skeleton while loading and never the empty state', () => {
    const { container } = render(
      <AsyncState isLoading isEmpty empty={{ title: 'Nothing' }}>
        <div>content</div>
      </AsyncState>,
    );
    expect(screen.queryByText('Nothing')).toBeNull();
    expect(screen.queryByText('content')).toBeNull();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});

describe('StatCard', () => {
  it('renders a real button when clickable, so Enter and Space work', () => {
    const onClick = vi.fn();
    render(<StatCard label="Deviations" value={7} onClick={onClick} />);
    const card = screen.getByRole('button');
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('treats a rising number as bad when higher is not better', () => {
    render(<StatCard label="Delay minutes" value={90} delta={12} higherIsBetter={false} />);
    expect(screen.getByText(/worsened by 12 percent/i)).toBeTruthy();
  });

  it('treats a rising number as good by default', () => {
    render(<StatCard label="On time" value={98} delta={3} />);
    expect(screen.getByText(/improved by 3 percent/i)).toBeTruthy();
  });
});

describe('StatusBadge', () => {
  it('never relies on colour alone: the label text carries the meaning', () => {
    render(<StatusBadge tone="danger">Overdue</StatusBadge>);
    expect(screen.getByText('Overdue')).toBeTruthy();
  });

  it('falls back to neutral rather than blanking an unknown status', () => {
    expect(statusToneFor({ Open: 'warning' } as never, 'Somethingelse')).toBe('neutral');
    expect(statusToneFor({ open: 'warning' } as never, 'OPEN')).toBe('warning');
  });
});

describe('Pagination', () => {
  it('marks the current page with aria-current', () => {
    render(<Pagination page={2} pageCount={5} onPageChange={() => {}} total={50} pageSize={10} />);
    expect(screen.getByLabelText('Page 2').getAttribute('aria-current')).toBe('page');
    expect(screen.getByLabelText('Page 1').getAttribute('aria-current')).toBeNull();
  });

  it('disables prev on the first page and next on the last', () => {
    const { rerender } = render(<Pagination page={1} pageCount={3} onPageChange={() => {}} />);
    expect((screen.getByLabelText('Previous page') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Next page') as HTMLButtonElement).disabled).toBe(false);
    rerender(<Pagination page={3} pageCount={3} onPageChange={() => {}} />);
    expect((screen.getByLabelText('Next page') as HTMLButtonElement).disabled).toBe(true);
  });

  it('reports the visible range', () => {
    render(<Pagination page={2} pageCount={5} onPageChange={() => {}} total={42} pageSize={10} />);
    expect(screen.getByText('11–20 of 42')).toBeTruthy();
  });

  it('collapses long page lists with gaps', () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, 'gap', 10]);
    expect(pageWindow(5, 10)).toEqual([1, 'gap', 4, 5, 6, 'gap', 10]);
    expect(pageWindow(10, 10)).toEqual([1, 'gap', 9, 10]);
  });
});

interface Row {
  id: string;
  train: string;
  delay: number;
}

const rows: Row[] = [
  { id: 'a', train: 'NS-0412', delay: 90 },
  { id: 'b', train: 'NS-0101', delay: 15 },
];

const columns = [
  { id: 'train', header: 'Train', cell: (r: Row) => r.train, sortable: true, sortValue: (r: Row) => r.train },
  { id: 'delay', header: 'Delay', cell: (r: Row) => r.delay, sortable: true, sortValue: (r: Row) => r.delay },
];

describe('DataTable', () => {
  it('renders rows', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} label="Deviations" />);
    expect(screen.getByText('NS-0412')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Deviations' })).toBeTruthy();
  });

  it('sorts locally and reports the direction to assistive tech', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const header = screen.getByText('Delay').closest('th')!;
    expect(header.getAttribute('aria-sort')).toBe('none');
    fireEvent.click(screen.getByText('Delay'));
    expect(screen.getByText('Delay').closest('th')!.getAttribute('aria-sort')).toBe('ascending');
  });

  it('hands sorting to the caller when the list is server-paginated, instead of reordering one page', () => {
    const onSortChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onSortChange={onSortChange}
        page={1}
        pageSize={10}
        total={10}
        onPageChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByText('Train'));
    expect(onSortChange).toHaveBeenCalledWith('train', 'asc');
    // Rows keep their server order.
    expect(screen.getAllByRole('row')[1].textContent).toContain('NS-0412');
  });

  it('makes a clickable row keyboard-operable WITHOUT breaking table semantics', () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={onRowClick}
        rowActionLabel={(r) => `Open deviation ${r.train}`}
      />,
    );

    const row = screen.getAllByRole('row')[1];
    // The row must STILL be a row. Re-roling it as a button (an earlier
    // iteration of this component did) removes it from the accessibility tree
    // and severs every cell from its column header, so the table stops being
    // a table for a screen reader.
    expect(row.tagName).toBe('TR');
    expect(row.getAttribute('tabindex')).toBe('0');
    expect(row.getAttribute('aria-label')).toBe('Open deviation NS-0412');

    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);

    fireEvent.keyDown(row, { key: ' ' });
    expect(onRowClick).toHaveBeenCalledTimes(2);

    fireEvent.click(row);
    expect(onRowClick).toHaveBeenCalledTimes(3);
  });

  it('leaves rows non-interactive when there is no row action', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const row = screen.getAllByRole('row')[1];
    expect(row.getAttribute('tabindex')).toBeNull();
    expect(row.getAttribute('aria-label')).toBeNull();
  });

  it('shows the empty state rather than a bare table when there are no rows', () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        empty={{ title: 'No deviations' }}
      />,
    );
    expect(screen.getByText('No deviations')).toBeTruthy();
  });
});

describe('ConfirmDialog', () => {
  it('will not confirm a typed confirmation until the phrase matches', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Withdraw signed handshake"
        onConfirm={onConfirm}
        requireTypedConfirmation="WITHDRAW"
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Type/i), { target: { value: 'withdraw' } });
    expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Type/i), { target: { value: 'WITHDRAW' } });
    expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('clears a previously typed phrase when reopened', () => {
    const { rerender } = render(
      <ConfirmDialog open onOpenChange={() => {}} title="Delete" onConfirm={() => {}} requireTypedConfirmation="DELETE" />,
    );
    fireEvent.change(screen.getByLabelText(/Type/i), { target: { value: 'DELETE' } });
    rerender(
      <ConfirmDialog open={false} onOpenChange={() => {}} title="Delete" onConfirm={() => {}} requireTypedConfirmation="DELETE" />,
    );
    rerender(
      <ConfirmDialog open onOpenChange={() => {}} title="Delete" onConfirm={() => {}} requireTypedConfirmation="DELETE" />,
    );
    expect((screen.getByLabelText(/Type/i) as HTMLInputElement).value).toBe('');
  });
});
