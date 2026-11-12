import { beforeEach, describe, expect, it } from 'vitest';
import { getPendingMutations, queueCoalesced, queueMutation, removeMutation } from './offlineDB';

/**
 * GPS pings while offline.
 *
 * The bug: every fix was appended to the outbox, so an hour in a notspot left
 * 120 rows. On reconnect all 120 replayed — each a stale position — ahead of
 * the driver's POD and collections, and the badge claimed "120 to sync", which
 * teaches a driver to stop believing the badge.
 *
 * Only the latest position is worth sending, so the pings must collapse into
 * one row.
 */

const URL = '/driver-portal/gps';

const ping = (lat: number) => ({ lat, lng: 28.0, speed: 0 });

/** Separate two writes by more than the 1ms resolution of createdAt. */
const tick = () => new Promise((r) => setTimeout(r, 5));

beforeEach(async () => {
  for (const m of await getPendingMutations()) await removeMutation(m.id);
});

describe('queueCoalesced', () => {
  it('collapses many GPS pings into a single outbox row', async () => {
    for (const lat of [-26.1, -26.2, -26.3, -26.4, -26.5]) {
      await queueCoalesced('gps', URL, ping(lat));
    }
    const rows = await getPendingMutations();
    expect(rows).toHaveLength(1);
  });

  it('keeps the LATEST position, not the first one queued', async () => {
    // The stale-first bug: replaying the oldest fix would tell dispatch the
    // driver was an hour back up the road.
    await queueCoalesced('gps', URL, ping(-26.1));
    await queueCoalesced('gps', URL, ping(-26.9));
    const [row] = await getPendingMutations();
    expect(row.body.lat).toBe(-26.9);
  });

  it('keeps its place in the queue instead of jumping to the back', async () => {
    // Ordering matters: the POD queued after the first ping must not be
    // overtaken by later pings.
    //
    // The outbox orders by createdAt, which has millisecond resolution — two
    // writes in the same millisecond have no defined order between them. The
    // pauses below separate them so this assertion is about ordering and not
    // about whichever uuid happens to sort first.
    await queueCoalesced('gps', URL, ping(-26.1));
    await tick();
    await queueMutation('pod', '/driver-portal/pod', { waybillId: 'w1' });
    await tick();
    await queueCoalesced('gps', URL, ping(-26.5));

    const rows = await getPendingMutations();
    expect(rows.map((r) => r.kind)).toEqual(['gps', 'pod']);
  });

  it('does not touch other kinds of write', async () => {
    await queueMutation('pod', '/driver-portal/pod', { waybillId: 'w1' });
    await queueMutation('pod', '/driver-portal/pod', { waybillId: 'w2' });
    // Two PODs are two real events and must stay two rows.
    expect(await getPendingMutations()).toHaveLength(2);
  });

  it('separates different URLs', async () => {
    await queueCoalesced('journey-update', '/driver-portal/journeys/j1/updates', { message: 'a' });
    await queueCoalesced('journey-update', '/driver-portal/journeys/j2/updates', { message: 'b' });
    expect(await getPendingMutations()).toHaveLength(2);
  });
});
