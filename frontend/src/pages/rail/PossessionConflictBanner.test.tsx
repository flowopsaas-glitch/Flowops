import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ConflictScan, PossessionConflict } from '../../api/railChangeApi';
import PossessionConflictBanner from './PossessionConflictBanner';

const conflict = (n: number, over: Partial<PossessionConflict> = {}): PossessionConflict => ({
  windowId: `w${n}`, windowTitle: `Re-sleepering ${n}`, windowKind: 'AD_HOC_EMERGENCY', corridorCode: 'COR-ORE', consignmentId: `c${n}`, consignmentNumber: `RAIL-2026-0000${n}`,
  overlapStart: '2026-10-05T00:00:00.000Z', overlapEnd: '2026-10-05T12:00:00.000Z', overlapHours: 12, severity: 'HARD', ...over,
});
const scan = (over: Partial<ConflictScan> = {}): ConflictScan => ({ conflicts: [], unscheduled: [], unresolved: [], consignmentsChecked: 3, ...over });

describe('PossessionConflictBanner', () => {
  it('shows nothing without a scan (the check being unavailable is not "all clear" and not an alarm)', () => {
    const { container } = render(<PossessionConflictBanner scan={null} />);
    expect(container.textContent).toBe('');
  });

  it('shows nothing when everything was checked and nothing clashes', () => {
    const { container } = render(<PossessionConflictBanner scan={scan()} />);
    expect(container.textContent).toBe('');
  });

  it('a locked / emergency clash is a red banner naming the consignment, the window, the corridor and the overlap', () => {
    render(<PossessionConflictBanner scan={scan({ conflicts: [conflict(1)] })} />);
    const banner = screen.getByRole('status');
    expect(banner.className).toMatch(/rose/);
    expect(banner.textContent).toMatch(/Possession conflict — 1 consignment overlaps 1 possession window/);
    expect(banner.textContent).toMatch(/RAIL-2026-00001/);
    expect(banner.textContent).toMatch(/Re-sleepering 1/);
    expect(banner.textContent).toMatch(/COR-ORE/);
    expect(banner.textContent).toMatch(/12 h overlap/);
    expect(banner.textContent).toMatch(/Locked — cannot be moved/);
  });

  it('an annual-plan clash that is not yet locked is amber', () => {
    render(<PossessionConflictBanner scan={scan({ conflicts: [conflict(1, { severity: 'PLANNED', windowKind: 'ANNUAL_PLAN' })] })} />);
    expect(screen.getByRole('status').className).toMatch(/amber/);
    expect(screen.getByRole('status').textContent).toMatch(/Annual plan — not yet locked/);
  });

  it('one hard clash among planned ones makes the whole banner red', () => {
    render(<PossessionConflictBanner scan={scan({ conflicts: [conflict(1, { severity: 'PLANNED' }), conflict(2, { severity: 'HARD' })] })} />);
    expect(screen.getByRole('status').className).toMatch(/rose/);
    expect(screen.getByRole('status').textContent).toMatch(/2 consignments overlap 2 possession windows/);
  });

  it('lists at most five and says how many more there are', () => {
    render(<PossessionConflictBanner scan={scan({ conflicts: [1, 2, 3, 4, 5, 6, 7].map((n) => conflict(n)) })} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText('…and 2 more.')).toBeTruthy();
  });

  it('with a consignment id it shows only that consignment\'s clashes', () => {
    render(<PossessionConflictBanner scan={scan({ conflicts: [conflict(1), conflict(2)] })} consignmentId="c2" />);
    const banner = screen.getByRole('status');
    expect(banner.textContent).toMatch(/this consignment overlaps 1 possession window/);
    expect(banner.textContent).toMatch(/RAIL-2026-00002/);
    expect(banner.textContent).not.toMatch(/RAIL-2026-00001/);
  });

  it('for a consignment with no clash of its own, shows nothing', () => {
    const { container } = render(<PossessionConflictBanner scan={scan({ conflicts: [conflict(1)] })} consignmentId="c9" />);
    expect(container.textContent).toBe('');
  });

  it('consignments that could not be checked are reported, never silently treated as clear', () => {
    const { rerender } = render(<PossessionConflictBanner scan={scan({ unscheduled: ['c1', 'c2'], unresolved: ['c2', 'c3'] })} />);
    expect(screen.getByRole('status').textContent).toMatch(/3 active consignments could not be checked against possession windows/);
    expect(screen.getByRole('status').className).toMatch(/slate/);
    rerender(<PossessionConflictBanner scan={scan({ unscheduled: ['c1'] })} consignmentId="c1" />);
    expect(screen.getByRole('status').textContent).toMatch(/Not checked against possession windows/);
    rerender(<PossessionConflictBanner scan={scan({ unscheduled: ['c1'] })} consignmentId="c7" />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('also mentions unchecked consignments alongside real clashes', () => {
    render(<PossessionConflictBanner scan={scan({ conflicts: [conflict(1)], unscheduled: ['c8'] })} />);
    expect(screen.getByRole('status').textContent).toMatch(/1 other consignment could not be checked/);
  });

  it('offers a way to the possession windows only when the caller supplies one', () => {
    const open = vi.fn();
    const { rerender } = render(<PossessionConflictBanner scan={scan({ conflicts: [conflict(1)] })} />);
    expect(screen.queryByRole('button', { name: 'View possession windows' })).toBeNull();
    rerender(<PossessionConflictBanner scan={scan({ conflicts: [conflict(1)] })} onOpenPossessions={open} />);
    fireEvent.click(screen.getByRole('button', { name: 'View possession windows' }));
    expect(open).toHaveBeenCalledTimes(1);
  });
});
