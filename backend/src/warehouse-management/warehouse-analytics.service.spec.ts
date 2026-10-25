import { WarehouseAnalyticsService } from './warehouse-analytics.service';

/**
 * KPI honesty contract: with zero observations in the period every accuracy
 * rate must be null (unavailable) — never 100% — and the observation counts
 * must be returned so the UI can disclose denominators.
 */
function makeService(rows: {
  movements?: any[]; receipts?: any[]; picks?: any[]; counts?: any[]; bins?: any[];
}) {
  const prisma: any = {
    stockMovement: { findMany: jest.fn().mockResolvedValue(rows.movements ?? []) },
    goodsReceipt: { findMany: jest.fn().mockResolvedValue(rows.receipts ?? []) },
    pickOrder: { findMany: jest.fn().mockResolvedValue(rows.picks ?? []) },
    cycleCount: { findMany: jest.fn().mockResolvedValue(rows.counts ?? []) },
    inventoryItem: {
      aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: { quantityOnHand: 0, quantityAllocated: 0 } }),
    },
    binLocation: { findMany: jest.fn().mockResolvedValue(rows.bins ?? []) },
  };
  return new WarehouseAnalyticsService(prisma);
}

describe('WarehouseAnalyticsService.getKpis accuracy honesty', () => {
  it('returns null (unavailable) rates with zero observations, never 100%', async () => {
    const svc = makeService({});
    const kpis: any = await svc.getKpis('company-1', 30);

    expect(kpis.accuracy.inventoryAccuracy).toBeNull();
    expect(kpis.accuracy.pickAccuracy).toBeNull();
    expect(kpis.accuracy.receiveAccuracy).toBeNull();
    expect(kpis.accuracy.inventoryObservations).toBe(0);
    expect(kpis.accuracy.pickOrdersObserved).toBe(0);
    expect(kpis.accuracy.completedReceiptsObserved).toBe(0);
    expect(kpis.efficiency.avgPickTimeHours).toBeNull();
    expect(typeof kpis.generatedAt).toBe('string');
  });

  it('computes rates from real observations and exposes numerators', async () => {
    const svc = makeService({
      counts: [
        { accuracyRate: 90, totalVariances: 2, varianceValue: 100 },
        { accuracyRate: null, totalVariances: 0, varianceValue: 0 },
      ],
      picks: [
        { status: 'PICKED', totalQty: 5, pickedQty: 5, assignedAt: new Date(), completedAt: new Date(), totalLines: 1, pickedLines: 1 },
        { status: 'PENDING', totalQty: 5, pickedQty: 2, assignedAt: null, completedAt: null, totalLines: 1, pickedLines: 0 },
      ],
      receipts: [
        { status: 'COMPLETED', expectedQty: 10, receivedQty: 10, damagedQty: 0, arrivedAt: new Date(), completedAt: new Date() },
        { status: 'COMPLETED', expectedQty: 10, receivedQty: 9, damagedQty: 1, arrivedAt: new Date(), completedAt: new Date() },
      ],
    });
    const kpis: any = await svc.getKpis('company-1', 30);

    expect(kpis.accuracy.inventoryAccuracy).toBe(90);
    expect(kpis.accuracy.inventoryObservations).toBe(1);
    expect(kpis.accuracy.pickAccuracy).toBe(50);
    expect(kpis.accuracy.picksFullyPicked).toBe(1);
    expect(kpis.accuracy.pickOrdersObserved).toBe(2);
    expect(kpis.accuracy.receiveAccuracy).toBe(50);
    expect(kpis.accuracy.undamagedReceipts).toBe(1);
    expect(kpis.accuracy.completedReceiptsObserved).toBe(2);
  });
});
