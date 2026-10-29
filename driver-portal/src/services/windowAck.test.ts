import { describe, expect, it } from 'vitest';
import {
  ackTimestamps, confirmedOutcome, interpretAckFailure, pendingSyncOutcome,
} from './windowAck';

/**
 * Classifying the answer to a gate-window confirmation.
 *
 * The case that has to be right: a driver confirms version 1 offline, the
 * terminal publishes version 2 before the device syncs, and the flush comes back
 * 409 SUPERSEDED. That is not a confirmation, and no code path here may report
 * it as one.
 */
describe('interpretAckFailure', () => {
  it('reads a 409 carrying the SUPERSEDED code as NOT CONFIRMED, with the current version', () => {
    const out = interpretAckFailure({
      status: 409,
      code: 'SUPERSEDED',
      message: 'That window version was superseded by a newer change and can no longer be acknowledged. Confirm version 2 instead — it carries the window that is actually current.',
      activeVersion: 2,
    });
    expect(out.kind).toBe('SUPERSEDED');
    expect(out.confirmed).toBe(false);
    expect(out.activeVersion).toBe(2);
    expect(out.retryable).toBe(false);
    expect(out.title).toMatch(/NOT CONFIRMED/i);
    // The server's own words are passed through, not paraphrased.
    expect(out.detail).toContain('Confirm version 2 instead');
  });

  it('still recognises a superseded 409 when the code is missing but the server said so', () => {
    const out = interpretAckFailure({ status: 409, message: 'That window version was superseded by a newer change.' });
    expect(out.kind).toBe('SUPERSEDED');
    expect(out.confirmed).toBe(false);
  });

  it('does NOT call an unrelated 409 superseded — it is still a refusal, never a success', () => {
    const out = interpretAckFailure({ status: 409, code: 'ALREADY_ACKED_BY_ANOTHER_DEVICE', message: 'Conflict' });
    expect(out.kind).toBe('REFUSED');
    expect(out.confirmed).toBe(false);
    expect(out.retryable).toBe(false);
  });

  it('treats 404 as "this change is not yours" rather than as a network problem', () => {
    const out = interpretAckFailure({ status: 404, message: 'You are not a recipient of this window change' });
    expect(out.kind).toBe('REFUSED');
    expect(out.confirmed).toBe(false);
    expect(out.title).toMatch(/not yours/i);
    expect(out.retryable).toBe(false);
  });

  it('treats 400 and 422 as permanent refusals', () => {
    expect(interpretAckFailure({ status: 400, message: 'Driver identity is required' }).kind).toBe('REFUSED');
    expect(interpretAckFailure({ status: 422, message: 'Unprocessable' }).kind).toBe('REFUSED');
  });

  it('treats "no answer" as PENDING SYNC — offline, timeout, 5xx and a dead session are not refusals', () => {
    expect(interpretAckFailure({ message: 'Network error' })).toMatchObject({ kind: 'PENDING_SYNC', retryable: true, confirmed: false });
    expect(interpretAckFailure(null)).toMatchObject({ kind: 'PENDING_SYNC', confirmed: false });
    expect(interpretAckFailure(undefined)).toMatchObject({ kind: 'PENDING_SYNC', confirmed: false });
    expect(interpretAckFailure({ status: 503, message: 'Service unavailable' })).toMatchObject({ kind: 'PENDING_SYNC', retryable: true });
    expect(interpretAckFailure({ status: 401, message: 'Session expired' })).toMatchObject({ kind: 'PENDING_SYNC', retryable: true });
  });

  it('says plainly that a pending sync is NOT yet a confirmation', () => {
    expect(pendingSyncOutcome().detail).toMatch(/NOT confirmed yet/i);
    expect(pendingSyncOutcome().confirmed).toBe(false);
  });

  it('classifies a stored outbox rejection the same way as a live error', () => {
    const fromOutbox = interpretAckFailure({
      rejection: { status: 409, code: 'SUPERSEDED', message: 'Superseded — confirm version 3 instead.', activeVersion: 3, at: Date.now() },
    });
    expect(fromOutbox).toMatchObject({ kind: 'SUPERSEDED', confirmed: false, activeVersion: 3 });
  });

  it('only a server-recorded confirmation is CONFIRMED', () => {
    expect(confirmedOutcome({ version: 2 }).confirmed).toBe(true);
    expect(confirmedOutcome({ version: 2, idempotentReplay: true }).title).toMatch(/Already confirmed/i);
    // Nothing else in this module can produce confirmed: true.
    for (const failure of [
      { status: 409, code: 'SUPERSEDED' }, { status: 404 }, { status: 400 }, { status: 500 }, {}, null,
    ]) {
      expect(interpretAckFailure(failure as any).confirmed).toBe(false);
    }
  });
});

describe('ackTimestamps', () => {
  it('keeps the server-observed time and the device-claimed time apart, and labels the difference', () => {
    const out = ackTimestamps({
      ackedAt: '2026-10-29T04:00:00.000Z',
      ackDeviceAt: '2026-10-29T01:30:00.000Z',
    });
    expect(out.server).toBe(new Date('2026-10-29T04:00:00.000Z').toLocaleString());
    expect(out.device).toBe(new Date('2026-10-29T01:30:00.000Z').toLocaleString());
    expect(out.offlineFlush).toBe(true);
    expect(out.server).not.toBe(out.device);
  });

  it('reports no device time when the confirmation was made online', () => {
    const out = ackTimestamps({ ackedAt: '2026-10-29T04:00:00.000Z', ackDeviceAt: null });
    expect(out.device).toBeNull();
    expect(out.offlineFlush).toBe(false);
  });

  it('never invents a server time', () => {
    expect(ackTimestamps({ ackedAt: null, ackDeviceAt: null }).server).toBe('not recorded');
  });
});
