import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the API client the queue replays through.
vi.mock('../api/client', () => ({
  api: { post: vi.fn() },
}));

import { api } from '../api/client';
import { getPodQueue, queuePod, syncPodQueue } from './offlinePod';

const post = api.post as unknown as ReturnType<typeof vi.fn>;

// A tiny 1x1 transparent PNG data URL (valid base64 for atob()).
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

describe('offlinePod queue', () => {
  beforeEach(() => {
    localStorage.clear();
    post.mockReset();
    setOnline(true);
  });

  afterEach(() => {
    setOnline(true);
  });

  it('starts empty', () => {
    expect(getPodQueue()).toEqual([]);
  });

  it('queuePod persists an entry with a generated id and timestamp', () => {
    const entry = queuePod({
      waybillId: 'wb1',
      waybillNumber: 'FO-001',
      recipient: 'Alice',
      signatureDataUrl: PNG_DATA_URL,
    });
    expect(entry.id).toMatch(/^pod_/);
    expect(entry.queuedAt).toBeTruthy();

    const queue = getPodQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].waybillId).toBe('wb1');
    expect(queue[0].waybillNumber).toBe('FO-001');
  });

  it('returns a tolerant empty array if storage holds invalid JSON', () => {
    localStorage.setItem('flowops_pod_queue', '{not valid json');
    expect(getPodQueue()).toEqual([]);
  });

  it('does not attempt to sync while offline', async () => {
    queuePod({ waybillId: 'wb1', waybillNumber: 'FO-001', signatureDataUrl: PNG_DATA_URL });
    setOnline(false);
    const synced = await syncPodQueue();
    expect(synced).toBe(0);
    expect(post).not.toHaveBeenCalled();
    // item stays queued for the next attempt
    expect(getPodQueue()).toHaveLength(1);
  });

  it('replays queued PODs and clears them on success', async () => {
    post.mockResolvedValue({ data: { ok: true } });
    queuePod({ waybillId: 'wb1', waybillNumber: 'FO-001', signatureDataUrl: PNG_DATA_URL });
    queuePod({ waybillId: 'wb2', waybillNumber: 'FO-002', signatureDataUrl: PNG_DATA_URL });

    const synced = await syncPodQueue();

    expect(synced).toBe(2);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenCalledWith('/waybills/wb1/deliver', expect.any(FormData));
    expect(getPodQueue()).toHaveLength(0);
  });

  it('keeps failed items queued and counts only the successes', async () => {
    post
      .mockResolvedValueOnce({ data: { ok: true } }) // wb1 succeeds
      .mockRejectedValueOnce(new Error('network')); // wb2 fails
    queuePod({ waybillId: 'wb1', waybillNumber: 'FO-001', signatureDataUrl: PNG_DATA_URL });
    queuePod({ waybillId: 'wb2', waybillNumber: 'FO-002', signatureDataUrl: PNG_DATA_URL });

    const synced = await syncPodQueue();

    expect(synced).toBe(1);
    const remaining = getPodQueue();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].waybillId).toBe('wb2');
  });

  it('returns 0 when there is nothing queued', async () => {
    const synced = await syncPodQueue();
    expect(synced).toBe(0);
    expect(post).not.toHaveBeenCalled();
  });
});
