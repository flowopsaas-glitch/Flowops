import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  queueMessage,
  getQueued,
  getPending,
  getRejected,
  pendingCount,
  markSent,
  markRejected,
  markAttempted,
  removeMessage,
  clearCompleted,
  requestFollowUp,
  resolveFollowUp,
  setJourneyStage,
  onChange,
  flush,
  __resetForTest,
} from './chatOutbox';

beforeEach(() => {
  __resetForTest();
});
afterEach(() => {
  __resetForTest();
});

function failingSend(overrides?: {
  status?: number;
  code?: string | null;
  message?: string;
}) {
  return vi.fn(async (_message: string, _key: string) => {
    const status = overrides?.status ?? 0;
    const err: any = new Error(overrides?.message ?? 'boom');
    if (status) err.status = status;
    if (overrides?.code) err.code = overrides.code;
    throw err;
  });
}

describe('chatOutbox — queue lifecycle', () => {
  it('queues a message as PENDING with device time and idempotency key', () => {
    const row = queueMessage('Delay at border', 'key-1');
    expect(row.id).toBe('key-1');
    expect(row.message).toBe('Delay at border');
    expect(row.state).toBe('PENDING');
    expect(row.attempts).toBe(0);
    expect(typeof row.createdAt).toBe('number');
    expect(pendingCount()).toBe(1);
    expect(getPending()).toHaveLength(1);
    expect(getRejected()).toHaveLength(0);
  });

  it('trims the message body before queuing', () => {
    const row = queueMessage('   Delay at border   ', 'k1');
    expect(row.message).toBe('Delay at border');
  });

  it('getQueued returns newest first', () => {
    queueMessage('oldest', 'k1');
    queueMessage('newest', 'k2');
    expect(getQueued()[0].message).toBe('newest');
  });

  it('getPending returns oldest first (FIFO)', () => {
    queueMessage('first', 'k1');
    queueMessage('second', 'k2');
    expect(getPending()[0].message).toBe('first');
    expect(getPending()[1].message).toBe('second');
  });

  it('markSent moves a row to SENT and removes it from pending', () => {
    const row = queueMessage('m', 'k1');
    const out = markSent('k1');
    expect(out?.state).toBe('SENT');
    expect(pendingCount()).toBe(0);
    expect(getPending()).toHaveLength(0);
  });

  it('markSent is a no-op for unknown or non-pending ids', () => {
    queueMessage('m', 'k1');
    expect(markSent('nope')).toBeUndefined();
    expect(markSent('k1')).toBeDefined();
    expect(markSent('k1')).toBeUndefined(); // already SENT
  });

  it('markRejected keeps the row as REJECTED with refusal detail', () => {
    queueMessage('m', 'k1');
    const out = markRejected('k1', { status: 409, code: 'SUPERSEDED', message: 'window changed' });
    expect(out?.state).toBe('REJECTED');
    expect(out?.attempts).toBe(1);
    expect(out?.lastError).toBe('window changed');
    expect(out?.rejection).toMatchObject({
      status: 409,
      code: 'SUPERSEDED',
      message: 'window changed',
    });
    expect(typeof out?.rejection?.at).toBe('number');
    expect(getRejected()).toHaveLength(1);
    expect(pendingCount()).toBe(0);
  });

  it('markAttempted keeps the row PENDING for retry', () => {
    const row = queueMessage('m', 'k1');
    const out = markAttempted('k1', 'timeout');
    expect(out?.state).toBe('PENDING');
    expect(out?.attempts).toBe(1);
    expect(out?.lastError).toBe('timeout');
    expect(pendingCount()).toBe(1);
  });

  it('removeMessage deletes a row', () => {
    queueMessage('m', 'k1');
    expect(removeMessage('k1')).toBe(true);
    expect(removeMessage('k1')).toBe(false);
    expect(pendingCount()).toBe(0);
  });

  it('clearCompleted removes SENT and REJECTED but keeps PENDING', () => {
    queueMessage('pending', 'k1');
    queueMessage('sent', 'k2');
    queueMessage('rejected', 'k3');
    markSent('k2');
    markRejected('k3', { status: 400, code: null, message: 'bad' });
    const cleared = clearCompleted();
    expect(cleared).toBe(2);
    expect(pendingCount()).toBe(1);
    expect(getQueued()[0].message).toBe('pending');
  });
});

describe('chatOutbox — dispatcher follow-up and journey-stage linkage', () => {
  it('requestFollowUp stamps the actor and time', () => {
    const row = queueMessage('m', 'k1');
    const out = requestFollowUp('k1', 'driver');
    expect(out?.followUp).toBe(true);
    expect(typeof out?.followUpAt).toBe('number');
    const r = getQueued().find((m) => m.id === 'k1');
    expect(r?.followUp).toBe(true);
    expect(r?.followUpBy).toBe('driver');
  });

  it('requestFollowUp is a no-op for unknown ids', () => {
    expect(requestFollowUp('nope', 'driver')).toBeUndefined();
  });

  it('resolveFollowUp stamps resolvedAt', () => {
    queueMessage('m', 'k1');
    requestFollowUp('k1', 'driver');
    const out = resolveFollowUp('k1');
    expect(typeof out?.resolvedAt).toBe('number');
    expect(getQueued().find((m) => m.id === 'k1')?.resolvedAt).toBe(out?.resolvedAt);
  });

  it('setJourneyStage tags and untags a message', () => {
    queueMessage('m', 'k1');
    const out = setJourneyStage('k1', 'stage-border');
    expect(out?.journeyStageId).toBe('stage-border');
    const untag = setJourneyStage('k1', null);
    expect(untag?.journeyStageId).toBeUndefined();
  });
});

describe('chatOutbox — flush replay', () => {
  it('sends all pending in FIFO order and removes confirmed ones', async () => {
    const send = vi.fn(async (message: string, key: string) => ({ id: key, message }));
    queueMessage('first', 'k1');
    queueMessage('second', 'k2');
    const result = await flush(send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]).toEqual(['first', 'k1']);
    expect(send.mock.calls[1]).toEqual(['second', 'k2']);
    expect(result.sent).toBe(2);
    expect(result.rejected).toBe(0);
    expect(result.stillPending).toBe(0);
    expect(pendingCount()).toBe(0);
  });

  it('permanent 4xx refusals are marked REJECTED and do not block the queue', async () => {
    const send = vi.fn(async (message: string) => {
      if (message === 'refused') {
        throw Object.assign(new Error('superseded'), { status: 409, code: 'SUPERSEDED' });
      }
      return {};
    });
    queueMessage('ok', 'k1');
    queueMessage('refused', 'k2');
    const result = await flush(send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(result.sent).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.stillPending).toBe(0);
    expect(getRejected()).toHaveLength(1);
    expect(getRejected()[0].message).toBe('refused');
    expect(getRejected()[0].rejection?.code).toBe('SUPERSEDED');
  });

  it('transient failures keep the row PENDING and stop the run', async () => {
    const send = failingSend(); // no status = transient
    queueMessage('m', 'k1');
    const result = await flush(send);
    expect(result.sent).toBe(0);
    expect(result.rejected).toBe(0);
    expect(result.stillPending).toBe(1);
    expect(getPending()).toHaveLength(1);
    expect(getPending()[0].attempts).toBe(1);
  });

  it('401 and 5xx are treated as transient (kept pending, retried)', async () => {
    const send401 = failingSend({ status: 401, message: 'dead session' });
    const send5xx = failingSend({ status: 500, message: 'server error' });
    queueMessage('m1', 'k1');
    await flush(send401);
    expect(getPending()).toHaveLength(1);
    queueMessage('m2', 'k2');
    await flush(send5xx);
    // FIFO: m1 is retried first and fails again, so m2 waits behind it.
    expect(getPending()).toHaveLength(2);
    expect(getPending().map((m) => m.message)).toEqual(['m1', 'm2']);
  });
});

describe('chatOutbox — change subscription', () => {
  it('notifies listeners on queue and on reject', () => {
    const fn = vi.fn();
    const unsub = onChange(fn);
    queueMessage('m', 'k1');
    expect(fn).toHaveBeenCalled();
    fn.mockClear();
    markRejected('k1', { status: 400, code: null, message: 'bad' });
    expect(fn).toHaveBeenCalled();
    unsub();
    fn.mockClear();
    queueMessage('m2', 'k2');
    expect(fn).not.toHaveBeenCalled();
  });
});
