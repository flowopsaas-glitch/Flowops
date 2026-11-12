import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiPost = vi.fn();

vi.mock('./api', () => ({
  default: {
    get: (...args: unknown[]) => apiGet(...args),
    post: (...args: unknown[]) => apiPost(...args),
  },
}));

import {
  currentStage, isNetworkError, loadJourneys, pendingUpdatesFor, sendJourneyUpdate, stageProgress,
  type DriverJourney, type JourneyStage,
} from './journeys';
import { getPendingMutations, removeMutation, type PendingMutation } from './offlineDB';

/**
 * The driver's half of the journey slice.
 *
 * The behaviour that matters is what happens when the network is not there,
 * because reporting a delay and having no signal are the same event in a
 * driver's day. These tests are mostly about the update never being lost and
 * never being duplicated.
 */

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

/** The outbox is real IndexedDB, so it has to be emptied between tests. */
async function drainOutbox() {
  for (const m of await getPendingMutations()) await removeMutation(m.id);
}

async function outbox(): Promise<PendingMutation[]> {
  return getPendingMutations();
}

const stage = (n: number, status: JourneyStage['status'], type: JourneyStage['type'] = 'LINEHAUL'): JourneyStage => ({
  id: `stage-${n}`, stageNumber: n, type, locationName: `Stop ${n}`, plannedAt: null, status,
});

const journey = (stages: JourneyStage[]): DriverJourney => ({
  id: 'j1', reference: 'J-1', origin: 'JHB', destination: 'CPT',
  plannedStart: null, plannedEnd: null, actualStart: null, actualEnd: null,
  status: 'IN_TRANSIT', createdAt: new Date().toISOString(), stages,
});

beforeEach(async () => {
  await drainOutbox();
  apiGet.mockReset();
  apiPost.mockReset();
  setOnline(true);
});

describe('sendJourneyUpdate', () => {
  it('sends straight through when there is signal', async () => {
    apiPost.mockResolvedValue({ id: 'u1' });
    const res = await sendJourneyUpdate({ journeyId: 'j1', type: 'DELAY_REPORT', message: 'Stuck at border' });
    expect(res.state).toBe('sent');
    expect(await outbox()).toHaveLength(0);
  });

  it('stores the update locally when offline, instead of losing it', async () => {
    setOnline(false);
    const res = await sendJourneyUpdate({ journeyId: 'j1', type: 'DELAY_REPORT', message: 'No signal at border' });

    expect(res.state).toBe('queued');
    // The write the driver made must survive; that is the entire point.
    expect(await outbox()).toHaveLength(1);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('queues when the request fails with no answer, because the server may still have taken it', async () => {
    // The ambiguous case: the request went out and the response never came
    // back. We cannot know whether it landed, so we queue it and let the
    // idempotency key settle the question server-side.
    apiPost.mockRejectedValue(new Error('Network Error'));
    const res = await sendJourneyUpdate({ journeyId: 'j1', type: 'DELAY_REPORT', message: 'Timed out' });
    expect(res.state).toBe('queued');
    expect(await outbox()).toHaveLength(1);
  });

  it('does NOT queue a definite refusal — retrying a "no" forever helps nobody', async () => {
    const err = Object.assign(new Error('Driver is not assigned to this journey'), { status: 400 });
    apiPost.mockRejectedValue(err);

    await expect(
      sendJourneyUpdate({ journeyId: 'j1', type: 'DELAY_REPORT', message: 'Not mine' }),
    ).rejects.toThrow(/not assigned/i);
    expect(await outbox()).toHaveLength(0);
  });

  it('reuses one idempotency key across the attempt and the queued copy', async () => {
    // THE bug this prevents: the outbox sends `X-Idempotency-Key` as a header,
    // which the journey endpoint ignores -- it dedupes on clientMessageId in
    // the body. If the queued copy minted a fresh key, the flush would create a
    // SECOND update reporting the same delay.
    apiPost.mockRejectedValue(new Error('Network Error'));
    const res = await sendJourneyUpdate({ journeyId: 'j1', type: 'DELAY_REPORT', message: 'Border queue' });

    const [row] = await outbox();
    expect(row.body.clientMessageId).toBe(res.clientMessageId);
    expect(row.body.clientMessageId).toBeTruthy();
  });

  it('queues a body identical to the one it tried to send, so a replay dedupes', async () => {
    // The backend rejects a replay whose message differs from the original
    // ("clientMessageId was already used for a different message"), so the
    // stored body has to be byte-for-byte the one we attempted.
    apiPost.mockRejectedValue(new Error('Network Error'));
    await sendJourneyUpdate({ journeyId: 'j1', type: 'INCIDENT_REPORT', message: 'Tyre burst' });

    const attempted = apiPost.mock.calls[0][1] as Record<string, unknown>;
    const [row] = await outbox();
    expect(row.body).toEqual(attempted);
  });

  it('stamps deviceOccurredAt when the driver taps send, not when it eventually uploads', async () => {
    // Provenance: an update written at 14:00 in a dead zone and flushed at 16:00
    // has to still say 14:00. Recomputing it at flush time would rewrite the
    // timeline to make the driver look like they reported late.
    setOnline(false);
    const before = new Date().toISOString();
    await sendJourneyUpdate({ journeyId: 'j1', type: 'DELAY_REPORT', message: 'Waiting' });

    const [row] = await outbox();
    const stamped = row.body.deviceOccurredAt as string;
    expect(new Date(stamped).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime() - 1000);
  });

  it('targets the journey the driver is reporting against', async () => {
    setOnline(false);
    await sendJourneyUpdate({ journeyId: 'j-99', type: 'GENERAL_NOTE', message: 'Note' });
    const [row] = await outbox();
    expect(row.url).toBe('/driver-portal/journeys/j-99/updates');
    expect(row.kind).toBe('journey-update');
  });

  it('carries the stage through when the driver is reporting on a specific one', async () => {
    setOnline(false);
    await sendJourneyUpdate({ journeyId: 'j1', type: 'DELAY_REPORT', message: 'At clearing', stageId: 'stage-2' });
    const [row] = await outbox();
    expect(row.body.stageId).toBe('stage-2');
  });

  it('refuses an empty message rather than sending dispatch nothing', async () => {
    await expect(sendJourneyUpdate({ journeyId: 'j1', type: 'GENERAL_NOTE', message: '   ' }))
      .rejects.toThrow(/message/i);
    expect(await outbox()).toHaveLength(0);
  });
});

describe('isNetworkError', () => {
  it('counts "no HTTP status at all" as a connectivity problem', () => {
    expect(isNetworkError(new Error('Network Error'))).toBe(true);
  });

  it('counts a device that knows it is offline as a connectivity problem', () => {
    setOnline(false);
    expect(isNetworkError(Object.assign(new Error('x'), { status: 500 }))).toBe(true);
  });

  it('does not mistake a 4xx refusal for a connectivity problem', () => {
    setOnline(true);
    expect(isNetworkError(Object.assign(new Error('nope'), { status: 404 }))).toBe(false);
  });
});

describe('pendingUpdatesFor', () => {
  it('surfaces an update the driver has sent but the server has not confirmed', async () => {
    setOnline(false);
    await sendJourneyUpdate({ journeyId: 'j1', type: 'DELAY_REPORT', message: 'Still queued' });

    const pending = await pendingUpdatesFor('j1');
    expect(pending).toHaveLength(1);
    expect(pending[0].message).toBe('Still queued');
    expect(pending[0].type).toBe('DELAY_REPORT');
  });

  it('does not show another journey’s updates on this journey', async () => {
    setOnline(false);
    await sendJourneyUpdate({ journeyId: 'j-other', type: 'GENERAL_NOTE', message: 'Other' });
    expect(await pendingUpdatesFor('j1')).toHaveLength(0);
  });

  it('goes quiet once the outbox has drained', async () => {
    setOnline(false);
    await sendJourneyUpdate({ journeyId: 'j1', type: 'GENERAL_NOTE', message: 'Gone' });
    await drainOutbox();
    expect(await pendingUpdatesFor('j1')).toHaveLength(0);
  });
});

describe('loadJourneys', () => {
  it('serves the cached journeys when the network is unreachable', async () => {
    apiGet.mockRejectedValue(new Error('Network Error'));
    const { fromCache } = await loadJourneys();
    expect(fromCache).toBe(true);
  });

  it('reports a live result as not from cache', async () => {
    apiGet.mockResolvedValue([]);
    const { fromCache } = await loadJourneys();
    expect(fromCache).toBe(false);
  });

  it('never hands back a non-array the list would choke on', async () => {
    apiGet.mockResolvedValue(undefined);
    const { journeys } = await loadJourneys();
    expect(Array.isArray(journeys)).toBe(true);
  });
});

describe('stageProgress', () => {
  it('counts only completed stages against the live ones', () => {
    expect(stageProgress(journey([stage(1, 'COMPLETED'), stage(2, 'PLANNED'), stage(3, 'PLANNED')])))
      .toEqual({ done: 1, total: 3 });
  });

  it('drops cancelled stages from the total, so the journey can still reach done', () => {
    // A scrubbed leg must not leave the driver permanently reading "2 of 3".
    expect(stageProgress(journey([stage(1, 'COMPLETED'), stage(2, 'CANCELLED'), stage(3, 'COMPLETED')])))
      .toEqual({ done: 2, total: 2 });
  });

  it('handles a journey with no stages planned yet', () => {
    expect(stageProgress(journey([]))).toEqual({ done: 0, total: 0 });
  });
});

describe('currentStage', () => {
  it('points at the stage in progress', () => {
    expect(currentStage(journey([stage(1, 'COMPLETED'), stage(2, 'IN_TRANSIT'), stage(3, 'PLANNED')]))?.stageNumber).toBe(2);
  });

  it('skips backwards over an earlier stage that was never started', () => {
    // The failure mode: stage 1 was left PLANNED, stage 2 is running. Taking
    // "the first incomplete stage" would tell the driver to go back.
    expect(currentStage(journey([stage(1, 'PLANNED'), stage(2, 'IN_TRANSIT')]))?.stageNumber).toBe(2);
  });

  it('falls back to the next planned stage when nothing is running', () => {
    expect(currentStage(journey([stage(1, 'COMPLETED'), stage(2, 'PLANNED')]))?.stageNumber).toBe(2);
  });

  it('returns null once every stage is done, rather than a stale one', () => {
    expect(currentStage(journey([stage(1, 'COMPLETED'), stage(2, 'COMPLETED')]))).toBeNull();
  });

  it('orders by stageNumber, not by the order the API happened to return', () => {
    expect(currentStage(journey([stage(3, 'PLANNED'), stage(1, 'PLANNED'), stage(2, 'PLANNED')]))?.stageNumber).toBe(1);
  });
});
