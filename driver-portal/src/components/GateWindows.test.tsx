import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GateWindows, { type GateWindowChange, type GateWindowItem } from './GateWindows';
import { flushOutbox } from '../services/syncEngine';
import {
  cacheGateWindows, getCachedGateWindows, getPendingMutations, getRejectedMutations, removeMutation,
} from '../services/offlineDB';

/**
 * The driver's confirmation screen, tested against the REAL offline outbox
 * (Dexie over fake-indexeddb) and a mocked transport.
 *
 * The scenario this file exists for is the one that can silently strand a truck:
 * a driver confirms version 1 with no signal, the terminal publishes version 2
 * before the device syncs, and the flush comes back 409 SUPERSEDED. The screen
 * must then say NOT CONFIRMED and show the window that is current — never a
 * success, and never a quietly emptied badge.
 */

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('../services/api', () => ({
  default: { get: apiMocks.get, post: apiMocks.post },
  api: { get: apiMocks.get, post: apiMocks.post },
}));

const iso = (minsFromNow: number) => new Date(Date.now() + minsFromNow * 60_000).toISOString();

function windowItem(over: Partial<GateWindowItem> = {}): GateWindowItem {
  return {
    appointmentId: 'appt-1',
    terminalName: 'Central Terminal',
    haulierName: 'Haulier Co',
    vehicleReg: 'ABC 123',
    purpose: 'DELIVERY',
    status: 'BOOKED',
    windowVersion: 1,
    currentWindow: { start: iso(180), end: iso(240), text: '2026-10-30 06:00–08:00 UTC' },
    change: null,
    supersededCount: 0,
    ...over,
  };
}

function changeV1(): GateWindowChange {
  return {
    id: 'chg-1',
    version: 1,
    changeKind: 'RESCHEDULED',
    changedAt: iso(-10),
    reason: 'Crane breakdown at the terminal',
    previousWindow: { start: iso(180), end: iso(240), text: '2026-10-30 06:00–08:00 UTC' },
    newWindow: { start: iso(300), end: iso(360), text: '2026-10-30 08:00–10:00 UTC' },
    acknowledged: false,
    acknowledgedAt: null,
    acknowledgedDeviceAt: null,
  };
}

function changeV2(): GateWindowChange {
  return {
    id: 'chg-2',
    version: 2,
    changeKind: 'RESCHEDULED',
    changedAt: iso(-2),
    reason: 'Yard congestion',
    previousWindow: { start: iso(300), end: iso(360), text: '2026-10-30 08:00–10:00 UTC' },
    newWindow: { start: iso(420), end: iso(480), text: '2026-10-30 10:00–12:00 UTC' },
    acknowledged: false,
    acknowledgedAt: null,
    acknowledgedDeviceAt: null,
  };
}

const payload = (items: GateWindowItem[]) => ({
  computedAt: new Date().toISOString(),
  source: 'gate windows assigned to this driver in this tenant',
  items,
});

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

/** A 409 shaped exactly like the api interceptor shapes it: status + code + words. */
function supersededError(activeVersion: number) {
  const err = new Error(
    'That window version was superseded by a newer change and can no longer be acknowledged. '
    + `Confirm version ${activeVersion} instead — it carries the window that is actually current.`,
  ) as Error & { status: number; code: string; activeVersion: number };
  err.status = 409;
  err.code = 'SUPERSEDED';
  err.activeVersion = activeVersion;
  return err;
}

async function clearOutbox() {
  for (const m of [...await getPendingMutations(), ...await getRejectedMutations()]) {
    await removeMutation(m.id);
  }
  await cacheGateWindows([]);
}

beforeEach(async () => {
  apiMocks.get.mockReset();
  apiMocks.post.mockReset();
  await clearOutbox();
  setOnline(true);
});

afterEach(async () => {
  await clearOutbox();
  setOnline(true);
});

describe('GateWindows — a change the driver has not confirmed', () => {
  it('shows the NEW window large, the superseded one struck through, and the reason', async () => {
    apiMocks.get.mockResolvedValue(payload([windowItem({ change: changeV1(), windowVersion: 2 })]));
    render(<GateWindows />);

    expect(await screen.findByText('2026-10-30 08:00–10:00 UTC')).toBeInTheDocument();
    // The old window is still on screen, semantically deleted.
    const old = screen.getByText('2026-10-30 06:00–08:00 UTC');
    expect(old.tagName).toBe('DEL');
    expect(screen.getByText(/Crane breakdown at the terminal/)).toBeInTheDocument();
    expect(screen.getByText(/version 1/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CONFIRM — I HAVE THE NEW WINDOW/i })).toBeInTheDocument();
  });

  it('shows no confirm button when nothing has changed', async () => {
    apiMocks.get.mockResolvedValue(payload([windowItem()]));
    render(<GateWindows />);
    expect(await screen.findByText('2026-10-30 06:00–08:00 UTC')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^CONFIRM —/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Your window \(unchanged\)/)).toBeInTheDocument();
  });

  it('renders a cancellation as "no replacement window", not as a time', async () => {
    const cancelled = { ...changeV1(), changeKind: 'CANCELLED', newWindow: null };
    apiMocks.get.mockResolvedValue(payload([windowItem({ change: cancelled })]));
    render(<GateWindows />);
    expect(await screen.findByText(/No replacement — do not travel to the terminal/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /I KNOW IT IS CANCELLED/i })).toBeInTheDocument();
  });
});

describe('GateWindows — confirming offline', () => {
  it('queues the confirmation and says PENDING SYNC, with device and server time labelled separately', async () => {
    setOnline(false);
    apiMocks.get.mockResolvedValue(payload([windowItem({ change: changeV1() })]));
    render(<GateWindows />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /CONFIRM — I HAVE THE NEW WINDOW/i }));

    expect(await screen.findByText('PENDING SYNC', { exact: true })).toBeInTheDocument();
    // It is queued in the real outbox, with the device's own claim about when
    // the driver tapped — and nothing has been recorded on the server.
    await waitFor(async () => {
      const pending = await getPendingMutations();
      expect(pending).toHaveLength(1);
      expect(pending[0].kind).toBe('window-ack');
      expect(pending[0].url).toBe('/driver-portal/gate-windows/chg-1/ack');
      expect(pending[0].body.deviceAckedAt).toBeTruthy();
    });
    expect(screen.getByText(/Server time: not recorded yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Device time when you tapped/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Confirmed$/)).not.toBeInTheDocument();
    expect(apiMocks.post).not.toHaveBeenCalled();
  });
});

describe('GateWindows — the offline conflict: v1 confirmed offline, v2 published before sync', () => {
  it('a 409 SUPERSEDED on flush is shown as NOT CONFIRMED, never as a success', async () => {
    // 1. Offline, the driver confirms version 1.
    setOnline(false);
    apiMocks.get.mockResolvedValue(payload([windowItem({ change: changeV1(), windowVersion: 2 })]));
    render(<GateWindows />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /CONFIRM — I HAVE THE NEW WINDOW/i }));
    expect(await screen.findByText('PENDING SYNC', { exact: true })).toBeInTheDocument();

    // 2. The terminal publishes version 2 while the device is still offline, and
    //    the driver regains signal. The server will refuse the stale ack.
    apiMocks.get.mockResolvedValue(payload([windowItem({ change: changeV2(), windowVersion: 3, supersededCount: 1 })]));
    apiMocks.post.mockRejectedValue(supersededError(2));
    setOnline(true);

    // 3. The outbox drains — exactly what the reconnect handler does.
    await act(async () => { await flushOutbox(); });

    // 4. The screen must now say the confirmation did NOT happen, in the server's
    //    own words, and show the window that is actually current.
    expect(await screen.findByText('NOT CONFIRMED — that window changed again', { exact: true })).toBeInTheDocument();
    // The server's own words appear on the window itself and in the summary
    // banner of refused confirmations.
    expect((await screen.findAllByText(/Confirm version 2 instead/)).length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText('2026-10-30 10:00–12:00 UTC')).toBeInTheDocument();
    expect(screen.getByText(/1 confirmation was NOT accepted/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show me the window that is current now/i })).toBeInTheDocument();

    // Nothing anywhere claims success for the stale version.
    expect(screen.queryByText(/^Confirmed$/)).not.toBeInTheDocument();
    expect(screen.queryByText('PENDING SYNC', { exact: true })).not.toBeInTheDocument();

    // 5. And the outbox kept the refusal as evidence instead of dropping it.
    const [pending, rejected] = await Promise.all([getPendingMutations(), getRejectedMutations()]);
    expect(pending).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].rejection).toMatchObject({ status: 409, code: 'SUPERSEDED', activeVersion: 2 });
  });

  it('a superseded confirmation is not retried forever, and does not block the rest of the queue', async () => {
    setOnline(false);
    apiMocks.get.mockResolvedValue(payload([windowItem({ change: changeV1() })]));
    render(<GateWindows />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /CONFIRM — I HAVE THE NEW WINDOW/i }));

    apiMocks.post.mockRejectedValue(supersededError(2));
    setOnline(true);
    await act(async () => { await flushOutbox(); });
    await act(async () => { await flushOutbox(); });

    // One refusal, still exactly one — the second flush found nothing pending.
    expect(await getRejectedMutations()).toHaveLength(1);
    expect(apiMocks.post).toHaveBeenCalledTimes(1);
    expect(await getPendingMutations()).toHaveLength(0);
  });

  it('a network failure on flush keeps the confirmation PENDING rather than reporting a refusal', async () => {
    setOnline(false);
    apiMocks.get.mockResolvedValue(payload([windowItem({ change: changeV1() })]));
    render(<GateWindows />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /CONFIRM — I HAVE THE NEW WINDOW/i }));

    apiMocks.post.mockRejectedValue(new Error('Network error'));
    setOnline(true);
    await act(async () => { await flushOutbox(); });

    const pending = await getPendingMutations();
    expect(pending).toHaveLength(1);
    expect(await getRejectedMutations()).toHaveLength(0);
    expect(screen.getByText('PENDING SYNC', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText(/NOT CONFIRMED/)).not.toBeInTheDocument();
  });
});

describe('GateWindows — confirming online', () => {
  it('records the confirmation with the server time and the labelled device time', async () => {
    const ackedAt = iso(-1);
    const deviceAckedAt = iso(-3);
    apiMocks.get.mockResolvedValue(payload([windowItem({ change: changeV1() })]));
    apiMocks.post.mockResolvedValue({
      recipient: { ack: { state: 'ACKNOWLEDGED', ackedAt, ackDeviceAt: deviceAckedAt } },
      change: { ...changeV1(), acknowledged: true, acknowledgedAt: ackedAt },
      idempotentReplay: false,
    });
    render(<GateWindows />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /CONFIRM — I HAVE THE NEW WINDOW/i }));

    expect(await screen.findByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText(`Server recorded: ${new Date(ackedAt).toLocaleString()}`)).toBeInTheDocument();
    // The idempotency key rides in the header, so a retry cannot double-record.
    expect(apiMocks.post).toHaveBeenCalledWith(
      '/driver-portal/gate-windows/chg-1/ack',
      expect.objectContaining({ deviceAckedAt: expect.any(String) }),
      expect.objectContaining({ headers: expect.objectContaining({ 'X-Idempotency-Key': 'driver-ack:chg-1' }) }),
    );
  });

  it('shows a confirmation already on the server, with both timestamps kept apart', async () => {
    const acked = {
      ...changeV1(),
      acknowledged: true,
      acknowledgedAt: '2026-10-29T04:00:00.000Z',
      acknowledgedDeviceAt: '2026-10-29T01:30:00.000Z',
    };
    apiMocks.get.mockResolvedValue(payload([windowItem({ change: acked })]));
    render(<GateWindows />);

    const serverText = `Server recorded: ${new Date('2026-10-29T04:00:00.000Z').toLocaleString()}`;
    expect(await screen.findByText(serverText)).toBeInTheDocument();
    expect(screen.getByText(/Device reported:/)).toBeInTheDocument();
    expect(screen.getByText(/this device's clock, at the time you tapped/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^CONFIRM —/i })).not.toBeInTheDocument();
  });
});

describe('GateWindows — honest loading, empty, error and stale states', () => {
  it('falls back to the cached list and says the data is from this device', async () => {
    await cacheGateWindows([windowItem({ change: changeV1() })] as any);
    apiMocks.get.mockRejectedValue(new Error('Network error'));
    render(<GateWindows />);

    expect(await screen.findByText(/Showing the last known windows stored on this device/i)).toBeInTheDocument();
    expect(screen.getByText('2026-10-30 08:00–10:00 UTC')).toBeInTheDocument();
    expect(screen.getByText(/The terminal may have changed them since/i)).toBeInTheDocument();
  });

  it('reports an error when there is nothing cached to show', async () => {
    apiMocks.get.mockRejectedValue(new Error('Network error'));
    expect(await getCachedGateWindows()).toHaveLength(0);
    render(<GateWindows />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load your gate windows: Network error/);
  });

  it('says so when no gate window is assigned, instead of showing an empty card', async () => {
    apiMocks.get.mockResolvedValue(payload([]));
    render(<GateWindows />);
    expect(await screen.findByText(/No gate window is assigned to you right now/)).toBeInTheDocument();
  });

  it('shows a connectivity warning while offline', async () => {
    setOnline(false);
    apiMocks.get.mockResolvedValue(payload([windowItem({ change: changeV1() })]));
    render(<GateWindows />);
    const banner = await screen.findByText(/You are offline\./);
    expect(within(banner.parentElement as HTMLElement).getByText(/PENDING SYNC, not confirmed/)).toBeInTheDocument();
  });

  it('names its source and freshness, so the driver knows what they are looking at', async () => {
    apiMocks.get.mockResolvedValue(payload([windowItem()]));
    render(<GateWindows />);
    expect(await screen.findByText(/Source: gate windows assigned to this driver in this tenant/)).toBeInTheDocument();
    expect(screen.getByText(/computed/)).toBeInTheDocument();
  });
});
