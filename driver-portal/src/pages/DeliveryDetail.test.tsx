import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// jsdom has no canvas and no camera; both are incidental to what is under test.
vi.mock('react-signature-canvas', async () => {
  const React = await import('react');
  return {
    // Must be a function component with an imperative handle, not a class:
    // React cannot invoke an ES class without `new`.
    default: React.forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({
        isEmpty: () => true,
        clear: () => undefined,
        toDataURL: () => '',
      }));
      return React.createElement('div', { 'data-testid': 'signature' });
    }),
  };
});
vi.mock('../components/PhotoCapture', () => ({
  default: ({ label }: { label: string }) => <div>{label}</div>,
}));

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../services/api', () => ({
  default: { get: apiMocks.get, post: apiMocks.post },
  api: { get: apiMocks.get, post: apiMocks.post },
}));

import DeliveryDetail from './DeliveryDetail';
import { cacheJobs } from '../services/offlineDB';

/**
 * Recovering the job after a reload.
 *
 * The bug this file exists for: router state does not survive a refresh, and
 * the page used to substitute an empty object. Because the branch is derived
 * from `job.waybillId`, a refreshed DELIVERY rendered the collection form and
 * offered the driver a "Confirm Pickup" button for a parcel they were standing
 * there to drop — an action that creates a waybill.
 */

const DELIVERY = {
  id: 'job-1',
  waybillId: 'wb-1',
  type: 'delivery',
  status: 'IN_TRANSIT',
  trackingNumber: 'TRK-9001',
  recipientName: 'Thandi Mokoena',
  recipientAddress: '14 Commissioner St, Johannesburg',
  recipientPhone: '+27820001111',
  codAmount: 0,
};

const COLLECTION = {
  id: 'job-2',
  type: 'collection',
  status: 'PENDING',
  trackingNumber: 'TRK-9002',
  recipientName: 'Sipho Ndlovu',
  recipientAddress: '8 Beach Rd, Cape Town',
  codAmount: 0,
};

function renderAt(path: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[state ? { pathname: path, state } : path]}>
      <Routes>
        <Route path="/delivery/:id" element={<DeliveryDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  apiMocks.get.mockReset();
  apiMocks.post.mockReset();
  void cacheJobs([]);
});

describe('DeliveryDetail after a refresh', () => {
  it('shows the delivery form for a DELIVERY, not the collection form', async () => {
    // THE regression: no router state, so the job must be recovered before the
    // form is chosen. Getting this wrong offers "Confirm Pickup" for a drop.
    apiMocks.get.mockResolvedValue([DELIVERY]);

    renderAt('/delivery/job-1');
    await waitFor(() => expect(screen.getByRole('button', { name: /mark delivered/i })).toBeTruthy());
    expect(screen.queryByRole('button', { name: /confirm pickup/i })).toBeNull();
  });

  it('still shows the collection form for a COLLECTION', async () => {
    apiMocks.get.mockResolvedValue([COLLECTION]);

    renderAt('/delivery/job-2');
    await waitFor(() => expect(screen.getByRole('button', { name: /confirm pickup/i })).toBeTruthy());
    expect(screen.queryByRole('button', { name: /mark delivered/i })).toBeNull();
  });

  it('recovers from the cached job list without a network call', async () => {
    // Offline in the field: the cache is the only source available.
    await cacheJobs([DELIVERY as any]);
    apiMocks.get.mockRejectedValue(new Error('Network Error'));

    renderAt('/delivery/job-1');
    await waitFor(() => expect(screen.getByRole('button', { name: /mark delivered/i })).toBeTruthy());
  });

  it('refuses to guess when the job is not on the driver’s list', async () => {
    apiMocks.get.mockResolvedValue([COLLECTION]);

    renderAt('/delivery/job-1'); // a delivery id that is no longer assigned
    await waitFor(() => expect(screen.getByText(/no longer on your list/i)).toBeTruthy());
    // Neither form is offered, because neither is known to be right.
    expect(screen.queryByRole('button', { name: /confirm pickup/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /mark delivered/i })).toBeNull();
  });

  it('keeps working when the job arrives in router state, as it does from the list', async () => {
    renderAt('/delivery/job-1', DELIVERY);
    expect(await screen.findByRole('button', { name: /mark delivered/i })).toBeTruthy();
    expect(apiMocks.get).not.toHaveBeenCalled();
  });

  it('shows the recipient it recovered, not a blank name field', async () => {
    apiMocks.get.mockResolvedValue([DELIVERY]);
    renderAt('/delivery/job-1');
    await waitFor(() => expect(screen.getByText('Thandi Mokoena')).toBeTruthy());
  });
});
