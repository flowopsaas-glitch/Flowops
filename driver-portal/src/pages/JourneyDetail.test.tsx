import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import JourneyDetail from './JourneyDetail';
import { getPendingMutations, removeMutation, cacheJourneys } from '../services/offlineDB';
import type { DriverJourney } from '../services/journeys';

/**
 * The screen a driver opens when something has gone wrong.
 *
 * Tested against the real offline outbox. The one thing that must never happen
 * here is the driver's words vanishing: they type a delay, they have no signal,
 * and the app has to keep what they said and tell them it kept it.
 */

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('../services/api', () => ({
  default: { get: apiMocks.get, post: apiMocks.post },
  api: { get: apiMocks.get, post: apiMocks.post },
}));

const JOURNEY: DriverJourney = {
  id: 'j1',
  reference: 'JRN-4471',
  origin: 'Johannesburg',
  destination: 'Cape Town',
  plannedStart: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  plannedEnd: new Date(Date.now() + 6 * 3_600_000).toISOString(),
  actualStart: new Date(Date.now() - 90 * 60_000).toISOString(),
  actualEnd: null,
  status: 'IN_TRANSIT',
  createdAt: new Date().toISOString(),
  stages: [
    { id: 's1', stageNumber: 1, type: 'LINEHAUL', locationName: 'JHB Depot', plannedAt: null, status: 'COMPLETED' },
    { id: 's2', stageNumber: 2, type: 'BORDER', locationName: 'Beitbridge', plannedAt: new Date(Date.now() + 3_600_000).toISOString(), status: 'IN_TRANSIT' },
    { id: 's3', stageNumber: 3, type: 'CLEARING', locationName: 'CPT Bond', plannedAt: null, status: 'PLANNED' },
  ],
  _count: { updates: 2 },
};

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

async function drainOutbox() {
  for (const m of await getPendingMutations()) await removeMutation(m.id);
}

function renderAt(path: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[state ? { pathname: path, state } : path]}>
      <Routes>
        <Route path="/journey/:id" element={<JourneyDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await drainOutbox();
  apiMocks.get.mockReset();
  apiMocks.post.mockReset();
  setOnline(true);
});

describe('JourneyDetail', () => {
  it('shows the journey and its stages in order', async () => {
    renderAt('/journey/j1', JOURNEY);
    expect(await screen.findByText('JRN-4471')).toBeTruthy();
    expect(screen.getByText('Johannesburg → Cape Town')).toBeTruthy();

    // Ordered by stage number, with the running one marked.
    const headings = screen.getAllByText(/^(Linehaul|Border|Clearing)$/);
    expect(headings.map((h) => h.textContent)).toEqual(['Linehaul', 'Border', 'Clearing']);
    expect(screen.getByText('now')).toBeTruthy();
  });

  it('confirms a sent update when there is signal', async () => {
    apiMocks.post.mockResolvedValue({ id: 'u1' });
    renderAt('/journey/j1', JOURNEY);

    const user = userEvent.setup();
    await user.type(await screen.findByPlaceholderText(/Held at border/i), 'Held at border, 2 hour queue');
    await user.click(screen.getByRole('button', { name: /send update/i }));

    await waitFor(() => expect(screen.getByText(/sent to dispatch/i)).toBeTruthy());
    expect(apiMocks.post).toHaveBeenCalled();
  });

  it('keeps the update and says so when there is no signal', async () => {
    // The core promise of this screen: what the driver typed is not lost.
    setOnline(false);
    renderAt('/journey/j1', JOURNEY);

    const user = userEvent.setup();
    await user.type(await screen.findByPlaceholderText(/Held at border/i), 'No signal at the border');
    await user.click(screen.getByRole('button', { name: /send update/i }));

    await waitFor(() => expect(screen.getByText(/saved on this phone/i)).toBeTruthy());
    expect(apiMocks.post).not.toHaveBeenCalled();

    // Durable, not just displayed: it is in the outbox waiting to be flushed.
    const queued = await getPendingMutations();
    expect(queued).toHaveLength(1);
    expect(queued[0].body.message).toBe('No signal at the border');
  });

  it('shows unsent updates on the screen, so the driver knows it was not lost', async () => {
    setOnline(false);
    renderAt('/journey/j1', JOURNEY);

    const user = userEvent.setup();
    await user.type(await screen.findByPlaceholderText(/Held at border/i), 'Still waiting for clearing');
    await user.click(screen.getByRole('button', { name: /send update/i }));

    await waitFor(() => expect(screen.getByText(/waiting to upload/i)).toBeTruthy());
    expect(screen.getByText('Still waiting for clearing')).toBeTruthy();
  });

  it('will not send an empty message', async () => {
    renderAt('/journey/j1', JOURNEY);
    const send = await screen.findByRole('button', { name: /send update/i });
    // Disabled rather than silently accepted: there is nothing to report.
    expect((send as HTMLButtonElement).disabled).toBe(true);
  });

  it('surfaces a real refusal instead of quietly storing a doomed retry', async () => {
    apiMocks.post.mockRejectedValue(
      Object.assign(new Error('Driver is not assigned to this journey'), { status: 400 }),
    );
    renderAt('/journey/j1', JOURNEY);

    const user = userEvent.setup();
    await user.type(await screen.findByPlaceholderText(/Held at border/i), 'Not my journey');
    await user.click(screen.getByRole('button', { name: /send update/i }));

    await waitFor(() => expect(screen.getByText(/not assigned/i)).toBeTruthy());
    // A refusal is not queued — retrying it forever would help nobody.
    expect(await getPendingMutations()).toHaveLength(0);
  });

  it('recovers the journey after a refresh, when router state is gone', async () => {
    // A driver refreshing mid-shift is ordinary. Without this the screen would
    // render an empty shell and they would assume the journey was lost.
    await cacheJourneys([JOURNEY as any]);
    apiMocks.get.mockResolvedValue([]);

    renderAt('/journey/j1'); // no location.state
    expect(await screen.findByText('JRN-4471')).toBeTruthy();
    expect(screen.getByText('Beitbridge')).toBeTruthy();
  });

  it('says plainly when the journey is not one of the driver’s', async () => {
    apiMocks.get.mockResolvedValue([]);
    renderAt('/journey/other');
    expect(await screen.findByText(/isn't on your list/i)).toBeTruthy();
  });

  it('defaults the report to the stage the driver is actually on', async () => {
    renderAt('/journey/j1', JOURNEY);
    const select = await screen.findByRole('combobox') as HTMLSelectElement;
    // Stage 2 (Border) is IN_TRANSIT — pre-selecting it saves the driver from
    // having to remember which leg they are reporting against.
    expect(select.value).toBe('s2');
  });
});
