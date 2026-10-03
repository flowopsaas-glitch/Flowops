import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const h = vi.hoisted(() => ({
  readiness: { required: true, ready: false, dgWagons: 0, missing: [], invalid: [], summary: 'consignment: missing Placard reference', blocksDeparture: true, consignmentNumber: 'RAIL-2026-00007' } as Record<string, unknown>,
  readinessError: false,
}));

const toast = vi.fn();
vi.mock('../../components/ToastProvider', () => ({ useToast: () => ({ showToast: toast }) }));
vi.mock('../../api/railChangeApi', () => ({
  getDangerousGoods: vi.fn(async () => { if (h.readinessError) throw new Error('nope'); return h.readiness; }),
}));
vi.mock('../../api/railApi', () => ({ updateConsignment: vi.fn(async () => ({})) }));

import { getDangerousGoods } from '../../api/railChangeApi';
import { updateConsignment, type RailConsignment } from '../../api/railApi';
import DangerousGoodsSection, { DgBadge, WagonDgPill } from './DangerousGoods';

const consignment = (over: Partial<RailConsignment> = {}): RailConsignment => ({
  id: 'c1', consignmentNumber: 'RAIL-2026-00007', status: 'PLANNED', commodity: 'Petrol', createdAt: '2026-10-01T00:00:00Z', isDangerousGoods: true,
  unNumber: 'UN1203', imdgClass: '3', placardRef: null, emergencyContact24h: '+27 11 555 0100', msdsDocumentUrl: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.readiness = { required: true, ready: false, dgWagons: 0, missing: [], invalid: [], summary: 'consignment: missing Placard reference, Safety data sheet (MSDS) link', blocksDeparture: true, consignmentNumber: 'RAIL-2026-00007' };
  h.readinessError = false;
});

describe('DgBadge (list column)', () => {
  it('shows a dash for a consignment with no dangerous goods', () => {
    render(<DgBadge dg={{ required: false, ready: true, problems: 0 }} />);
    expect(screen.getByLabelText('No dangerous goods').textContent).toBe('—');
  });
  it('is green when ready', () => {
    render(<DgBadge dg={{ required: true, ready: true, problems: 0 }} />);
    const b = screen.getByText('DG ready');
    expect(b.className).toMatch(/emerald/);
  });
  it('is red and counts the gaps when not ready, with a title that says departure is blocked', () => {
    render(<DgBadge dg={{ required: true, ready: false, problems: 2 }} />);
    const b = screen.getByText('DG · 2 gaps');
    expect(b.className).toMatch(/rose/);
    expect(b.getAttribute('title')).toMatch(/departure is blocked/);
  });
  it('shows a dash when the server did not send a summary', () => {
    render(<DgBadge />);
    expect(screen.getByLabelText('No dangerous goods')).toBeTruthy();
  });
});

describe('WagonDgPill', () => {
  it('renders nothing for a wagon without dangerous goods', () => {
    const { container } = render(<WagonDgPill wagon={{ isDangerousGoods: false, unNumber: 'UN1203' }} />);
    expect(container.textContent).toBe('');
  });
  it('shows UN number and class; red when details are missing', () => {
    const { rerender } = render(<WagonDgPill wagon={{ isDangerousGoods: true, unNumber: 'UN1203', imdgClass: '3' }} />);
    expect(screen.getByText('UN1203 · class 3').className).toMatch(/amber/);
    rerender(<WagonDgPill wagon={{ isDangerousGoods: true }} />);
    expect(screen.getByText('DG — details missing').className).toMatch(/rose/);
  });
});

describe('DangerousGoodsSection — what the dispatch gate sees', () => {
  it('incomplete details: a red banner says departure is blocked and quotes the server\'s own summary', async () => {
    render(<DangerousGoodsSection consignment={consignment()} canWrite />);
    const banner = await screen.findByText('Departure is blocked — dangerous-goods details are incomplete');
    expect(banner.closest('[role="status"]')!.textContent).toMatch(/missing Placard reference, Safety data sheet \(MSDS\) link/);
    expect(banner.closest('[role="status"]')!.className).toMatch(/rose/);
    expect(getDangerousGoods).toHaveBeenCalledWith('c1');
  });

  it('complete details: a green banner', async () => {
    h.readiness = { ...h.readiness, ready: true, summary: 'Dangerous-goods details complete.', blocksDeparture: false };
    render(<DangerousGoodsSection consignment={consignment()} canWrite />);
    const banner = await screen.findByText('Dangerous goods — all mandatory details are complete');
    expect(banner.closest('[role="status"]')!.className).toMatch(/emerald/);
  });

  it('no dangerous goods: explains how to declare them, with no banner', async () => {
    h.readiness = { required: false, ready: true, dgWagons: 0, missing: [], invalid: [], summary: 'No dangerous goods declared.', blocksDeparture: false, consignmentNumber: 'X' };
    render(<DangerousGoodsSection consignment={consignment({ isDangerousGoods: false })} canWrite />);
    expect(await screen.findByText(/No dangerous goods declared\. Tick the box below/)).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByLabelText('UN number')).toBeNull(); // the five fields appear once it is ticked
  });

  it('says how many wagons are flagged individually', async () => {
    h.readiness = { ...h.readiness, dgWagons: 2 };
    render(<DangerousGoodsSection consignment={consignment()} canWrite />);
    expect(await screen.findByText(/2 wagons flagged individually/)).toBeTruthy();
  });

  it('if the readiness cannot be loaded it says so instead of implying all is well', async () => {
    h.readinessError = true;
    render(<DangerousGoodsSection consignment={consignment()} canWrite />);
    expect(await screen.findByText('Dangerous-goods readiness could not be loaded.')).toBeTruthy();
    expect(screen.queryByText(/all mandatory details are complete/)).toBeNull();
  });
});

describe('DangerousGoodsSection — editing', () => {
  const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
  const save = () => screen.getByRole('button', { name: /Save dangerous-goods details/ }) as HTMLButtonElement;

  it('is prefilled from the saved consignment', async () => {
    render(<DangerousGoodsSection consignment={consignment()} canWrite />);
    await screen.findByTestId('dg-section');
    expect((screen.getByTestId('dg-flag') as HTMLInputElement).checked).toBe(true);
    expect(field('UN number').value).toBe('UN1203');
    expect(field('IMDG class').value).toBe('3');
    expect(field('Placard reference').value).toBe('');
    expect(field('24-hour emergency contact').value).toBe('+27 11 555 0100');
  });

  it('shows a readable message for a malformed value and will not save it', async () => {
    render(<DangerousGoodsSection consignment={consignment()} canWrite />);
    await screen.findByTestId('dg-section');
    fireEvent.change(field('UN number'), { target: { value: 'UN12' } });
    fireEvent.change(field('Safety data sheet (MSDS) link'), { target: { value: 'http://insecure.example/m.pdf' } });
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent);
    expect(alerts).toEqual(expect.arrayContaining([expect.stringMatching(/UN followed by four digits/), expect.stringMatching(/https:\/\/ link/)]));
    expect(save().disabled).toBe(true);
    fireEvent.click(save());
    expect(updateConsignment).not.toHaveBeenCalled();
  });

  it('saves the normalised values with blanks as null, then re-reads the readiness and tells the page', async () => {
    const onSaved = vi.fn();
    render(<DangerousGoodsSection consignment={consignment()} canWrite onSaved={onSaved} />);
    await screen.findByTestId('dg-section');
    fireEvent.change(field('UN number'), { target: { value: ' un 1267 ' } });
    fireEvent.change(field('Placard reference'), { target: { value: '  Placard 3  ' } });
    fireEvent.change(field('Safety data sheet (MSDS) link'), { target: { value: 'https://example.org/msds.pdf' } });
    fireEvent.change(field('IMDG class'), { target: { value: '   ' } });
    fireEvent.click(save());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(updateConsignment).toHaveBeenCalledWith('c1', {
      isDangerousGoods: true, unNumber: 'UN1267', imdgClass: null, placardRef: 'Placard 3', emergencyContact24h: '+27 11 555 0100', msdsDocumentUrl: 'https://example.org/msds.pdf',
    });
    expect(getDangerousGoods).toHaveBeenCalledTimes(2); // mount + after save
    expect(toast).toHaveBeenCalledWith('Dangerous-goods details saved', 'success');
  });

  it('declaring dangerous goods on a clean consignment reveals the five fields', async () => {
    h.readiness = { required: false, ready: true, dgWagons: 0, missing: [], invalid: [], summary: '', blocksDeparture: false, consignmentNumber: 'X' };
    render(<DangerousGoodsSection consignment={consignment({ isDangerousGoods: false, unNumber: null, imdgClass: null, emergencyContact24h: null })} canWrite />);
    await screen.findByTestId('dg-section');
    expect(screen.queryByLabelText('UN number')).toBeNull();
    fireEvent.click(screen.getByTestId('dg-flag'));
    for (const l of ['UN number', 'IMDG class', 'Placard reference', '24-hour emergency contact', 'Safety data sheet (MSDS) link']) expect(screen.getByLabelText(l)).toBeTruthy();
  });

  it('a failed save is reported and does not claim success', async () => {
    vi.mocked(updateConsignment).mockRejectedValueOnce(new Error('Validation failed'));
    const onSaved = vi.fn();
    render(<DangerousGoodsSection consignment={consignment()} canWrite onSaved={onSaved} />);
    await screen.findByTestId('dg-section');
    fireEvent.click(save());
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Could not save: Validation failed', 'error'));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('a different consignment resets the form to what that consignment has saved', async () => {
    const { rerender } = render(<DangerousGoodsSection consignment={consignment()} canWrite />);
    await screen.findByTestId('dg-section');
    fireEvent.change(field('UN number'), { target: { value: 'UN9999' } });
    rerender(<DangerousGoodsSection consignment={consignment({ id: 'c2', unNumber: 'UN1075' })} canWrite />);
    await waitFor(() => expect(field('UN number').value).toBe('UN1075'));
    expect(getDangerousGoods).toHaveBeenLastCalledWith('c2');
  });
});

describe('DangerousGoodsSection — a viewer', () => {
  it('sees the details read-only: no checkbox, no inputs, no save button', async () => {
    render(<DangerousGoodsSection consignment={consignment({ placardRef: 'Placard 3' })} canWrite={false} />);
    const section = within(await screen.findByTestId('dg-section'));
    expect(section.queryByTestId('dg-flag')).toBeNull();
    expect(section.queryByRole('textbox')).toBeNull();
    expect(section.queryByRole('button', { name: /Save/ })).toBeNull();
    expect(section.getByText('UN1203')).toBeTruthy();
    expect(section.getByText('Placard 3')).toBeTruthy();
    expect(section.getAllByText('—').length).toBeGreaterThan(0); // the missing MSDS link is shown as missing
  });
  it('still sees the blocked-departure banner (it is information, not a control)', async () => {
    render(<DangerousGoodsSection consignment={consignment()} canWrite={false} />);
    expect(await screen.findByText('Departure is blocked — dangerous-goods details are incomplete')).toBeTruthy();
  });
});
