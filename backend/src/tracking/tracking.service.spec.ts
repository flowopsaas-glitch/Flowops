import { TrackingService } from './tracking.service';

/**
 * ETA provenance contract: the public payload must say whether the estimate
 * came from the road-routing service (osrm) or the straight-line fallback
 * (haversine), so the UI never presents an approximation as a road distance.
 */
const waybill = {
  trackingNumber: 'FO-1',
  status: 'IN_TRANSIT',
  podDeliveredAt: null,
  recipientName: 'A Customer',
  recipientLat: -26.1,
  recipientLng: 28.0,
  ratingToken: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  company: { brandName: 'Parcel Co', name: 'Parcel Co', logoUrl: null, primaryColor: '#10b981' },
  shipments: [
    {
      currentLat: -26.2,
      currentLng: 28.04,
      estimatedDelivery: null,
      updatedAt: new Date(),
      driver: { name: 'Driver One', vehicleReg: 'ABC 123' },
    },
  ],
};

function makeService() {
  const prisma: any = { waybill: { findFirst: jest.fn().mockResolvedValue(waybill) } };
  return new TrackingService(prisma);
}

describe('TrackingService ETA provenance', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.OSRM_BASE_URL;
  });

  it('labels the estimate osrm when the routing service responds', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ routes: [{ distance: 12000, duration: 1500 }] }),
    }) as any;

    const result: any = await makeService().track('FO-1');
    expect(result.etaSource).toBe('osrm');
    expect(result.remainingKm).toBe(12);
    expect(result.etaMinutes).toBe(25);
  });

  it('labels the estimate haversine when the routing service fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;

    const result: any = await makeService().track('FO-1');
    expect(result.etaSource).toBe('haversine');
    expect(result.etaMinutes).toBeGreaterThan(0);
    expect(result.remainingKm).toBeGreaterThan(0);
  });

  it('returns null ETA fields when no live position exists', async () => {
    const prisma: any = {
      waybill: {
        findFirst: jest.fn().mockResolvedValue({
          ...waybill,
          shipments: [{ ...waybill.shipments[0], currentLat: null, currentLng: null }],
        }),
      },
    };
    const result: any = await new TrackingService(prisma).track('FO-1');
    expect(result.etaMinutes).toBeNull();
    expect(result.remainingKm).toBeNull();
    expect(result.etaSource).toBeNull();
  });
});
