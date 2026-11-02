import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Chat from './Chat';
import { __resetForTest } from '../services/chatOutbox';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../services/api', () => ({ default: api }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

beforeEach(() => {
  __resetForTest();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  Element.prototype.scrollIntoView = vi.fn();
  api.get.mockReset().mockResolvedValue([]);
  api.post.mockReset().mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  __resetForTest();
});

describe('dispatch chat', () => {
  it('offers a safety reminder and quick starts without overwriting a draft', async () => {
    render(<Chat />);
    await screen.findByText(/No messages yet/i);
    expect(screen.getByText(/contact local emergency services/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delay' }));
    const input = screen.getByRole('textbox', { name: 'Message dispatch' });
    expect(input).toHaveValue('Delay: ');
    fireEvent.change(input, { target: { value: 'Delay: waiting' } });
    fireEvent.click(screen.getByRole('button', { name: 'Road issue' }));
    expect(input).toHaveValue('Delay: waiting');
  });

  it('queues messages offline and does not send them until reconnected', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    render(<Chat />);
    await screen.findByText(/No messages yet/i);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message dispatch' }), { target: { value: 'Delayed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    // Queued optimistically: no API call while offline.
    expect(api.post).not.toHaveBeenCalledWith('/driver-portal/chat/send', expect.anything());
    // Draft retained, offline banner truthful about queueing.
    expect(screen.getByRole('textbox', { name: 'Message dispatch' })).toHaveValue('');
    expect(screen.getByText(/queued and will send automatically/i)).toBeInTheDocument();
    // The optimistic message renders with device time and PENDING SYNC.
    expect(screen.getByText('Delayed')).toBeInTheDocument();
    expect(screen.getByText(/PENDING SYNC/i)).toBeInTheDocument();
  });

  it('preserves a draft and warns of possible delivery after a timeout', async () => {
    api.post.mockImplementation((url: string) => url.endsWith('/chat/send') ? Promise.reject(new Error('timeout')) : Promise.resolve({}));
    render(<Chat />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message dispatch' }), { target: { value: 'Delay at border' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(screen.getByText(/Delivery unconfirmed/i)).toBeInTheDocument());
    expect(screen.getByRole('textbox', { name: 'Message dispatch' })).toHaveValue('Delay at border');
    expect(api.post.mock.calls.filter(([url]) => url.endsWith('/chat/send'))).toHaveLength(1);
  });

  it('does not replace newer messages with an older, late response', async () => {
    let finishFirst!: (messages: unknown[]) => void;
    api.get.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
    api.get.mockResolvedValueOnce([{ id: 'new', message: 'Newest update', senderType: 'driver', createdAt: '2026-10-31T12:00:00Z' }]);
    render(<Chat />);
    expect(screen.getByText(/Loading messages/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Message dispatch' }), { target: { value: 'Update' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText('Newest update')).toBeInTheDocument();
    await act(async () => finishFirst([]));
    expect(screen.getByText('Newest update')).toBeInTheDocument();
    expect(screen.queryByText(/No messages yet/i)).not.toBeInTheDocument();
  });

  it('treats an invalid response as a load failure, not an empty conversation', async () => {
    api.get.mockResolvedValue({ invalid: true });
    render(<Chat />);
    expect(await screen.findByText(/Unable to refresh messages/i)).toBeInTheDocument();
    expect(screen.queryByText(/No messages yet/i)).not.toBeInTheDocument();
  });

  it('sends a client-generated idempotency key and clears the draft on success', async () => {
    api.post.mockImplementation((url: string) =>
      url.endsWith('/chat/send') ? Promise.resolve({}) : Promise.resolve([]),
    );
    render(<Chat />);
    const input = screen.getByRole('textbox', { name: 'Message dispatch' });
    fireEvent.change(input, { target: { value: 'Delay at border' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Message dispatch' })).toHaveValue(''),
    );
    const sendCalls = api.post.mock.calls.filter(([url]) => url.endsWith('/chat/send'));
    expect(sendCalls).toHaveLength(1);
    expect(typeof sendCalls[0][1].clientMessageId).toBe('string');
    expect(sendCalls[0][1].message).toBe('Delay at border');
    expect(screen.queryByText(/Delivery unconfirmed/i)).not.toBeInTheDocument();
  });

  it('retries the same idempotency key after an unconfirmed send', async () => {
    let captured: any;
    api.post.mockImplementation((url: string, body: any) => {
      if (url.endsWith('/chat/send')) { captured = body; return Promise.reject(new Error('timeout')); }
      return Promise.resolve([]);
    });
    render(<Chat />);
    const input = screen.getByRole('textbox', { name: 'Message dispatch' });
    fireEvent.change(input, { target: { value: 'Delay at border' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(screen.getByText(/Delivery unconfirmed/i)).toBeInTheDocument());
    expect(screen.getByRole('textbox', { name: 'Message dispatch' })).toHaveValue('Delay at border');
    expect(typeof captured.clientMessageId).toBe('string');
    const firstKey = captured.clientMessageId;
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() =>
      expect(api.post.mock.calls.filter(([url]) => url.endsWith('/chat/send'))).toHaveLength(2),
    );
    const last = api.post.mock.calls.filter(([url]) => url.endsWith('/chat/send')).pop()!;
    expect(last[1].clientMessageId).toBe(firstKey);
    expect(last[1].message).toBe('Delay at border');
  });

  it('uses a new idempotency key when the draft changes after an unconfirmed send', async () => {
    api.post.mockImplementation((url: string) =>
      url.endsWith('/chat/send') ? Promise.reject(new Error('timeout')) : Promise.resolve([]),
    );
    render(<Chat />);
    const input = screen.getByRole('textbox', { name: 'Message dispatch' });
    fireEvent.change(input, { target: { value: 'Delay at border' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(screen.getByText(/Delivery unconfirmed/i)).toBeInTheDocument());
    const firstKey = api.post.mock.calls.filter(([url]) => url.endsWith('/chat/send')).pop()![1].clientMessageId;
    fireEvent.change(input, { target: { value: 'Delay at border: brake' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() =>
      expect(api.post.mock.calls.filter(([url]) => url.endsWith('/chat/send'))).toHaveLength(2),
    );
    const last = api.post.mock.calls.filter(([url]) => url.endsWith('/chat/send')).pop()!;
    expect(last[1].clientMessageId).not.toBe(firstKey);
    expect(last[1].message).toBe('Delay at border: brake');
  });

  it('shows a single check for a sent message and two checks when delivered/read', async () => {
    api.get.mockResolvedValue([
      { id: 'm1', message: 'Delay at border', senderType: 'driver', createdAt: '2026-10-31T12:00:00Z' },
      { id: 'm2', message: 'Running late', senderType: 'driver', createdAt: '2026-10-31T12:01:00Z', deliveredAt: '2026-10-31T12:00:05Z', readAt: '2026-10-31T12:00:08Z' },
    ]);
    render(<Chat />);
    await screen.findByText('Delay at border');
    expect(screen.getByText('Running late')).toBeInTheDocument();
    const checks = screen.getAllByText('✔');
    expect(checks).toHaveLength(3); // m1: one, m2: two
  });

  it('marks dispatch messages as delivered on load', async () => {
    api.get.mockResolvedValue([
      { id: 'd1', message: 'Hello', senderType: 'dispatch', createdAt: '2026-10-31T12:00:00Z' },
    ]);
    api.post.mockResolvedValue({});
    render(<Chat />);
    await screen.findByText('Hello');
    expect(api.post).toHaveBeenCalledWith('/driver-portal/chat/delivered', { messageIds: ['d1'] });
  });

  it('shows sending status while a message is in flight', async () => {
    let finishSend!: (value?: unknown) => void;
    api.post.mockImplementation((url: string) =>
      url.endsWith('/chat/send') ? new Promise((resolve) => { finishSend = resolve; }) : Promise.resolve([]),
    );
    render(<Chat />);
    const input = screen.getByRole('textbox', { name: 'Message dispatch' });
    fireEvent.change(input, { target: { value: 'Sending now' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    // While in flight there is no delivery state claim yet; the send alert stays null.
    expect(screen.queryByText(/Delivery unconfirmed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Not sent/i)).not.toBeInTheDocument();
    finishSend();
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Message dispatch' })).toHaveValue(''),
    );
  });

  it('does not display an empty conversation as fact if loading fails', async () => {
    api.get.mockRejectedValue(new Error('offline'));
    render(<Chat />);
    await waitFor(() => expect(screen.getByText(/Unable to refresh messages/i)).toBeInTheDocument());
    expect(screen.queryByText(/No messages yet/i)).not.toBeInTheDocument();
  });
});
