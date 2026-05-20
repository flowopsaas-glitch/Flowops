import { describe, it, expect } from 'vitest';
import { riskScoreForShipment } from './aiHeuristics';
import type { ShipmentLike } from './aiHeuristics';

describe('riskScoreForShipment', () => {
  const base: ShipmentLike = {
    id: '1', status: 'in-transit', customer: 'Test',
  };

  it('returns 0 for healthy shipment', () => {
    const r = riskScoreForShipment(base);
    expect(r.score).toBe(0);
    expect(r.reasons).toEqual([]);
  });

  it('late = +30', () => {
    const r = riskScoreForShipment({ ...base, isLate: true });
    expect(r.score).toBe(30);
    expect(r.reasons).toContain('Shipment is late');
  });

  it('high priority = +20', () => {
    const r = riskScoreForShipment({ ...base, isHighPriority: true });
    expect(r.score).toBe(20);
  });

  it('no driver = +25', () => {
    const r = riskScoreForShipment({ ...base, driverAssigned: false });
    expect(r.score).toBe(25);
  });

  it('stale update >60min = +15', () => {
    const r = riskScoreForShipment({ ...base, lastUpdateMinutesAgo: 90 });
    expect(r.score).toBe(15);
  });

  it('stale update <60min = 0', () => {
    const r = riskScoreForShipment({ ...base, lastUpdateMinutesAgo: 30 });
    expect(r.score).toBe(0);
  });

  it('delayed status = +10', () => {
    const r = riskScoreForShipment({ ...base, status: 'delayed' });
    expect(r.score).toBe(10);
  });

  it('accumulates multiple risks', () => {
    const r = riskScoreForShipment({
      ...base, isLate: true, isHighPriority: true, driverAssigned: false, status: 'delayed',
    });
    expect(r.score).toBe(85);
    expect(r.reasons).toHaveLength(4);
  });

  it('caps at 100', () => {
    const r = riskScoreForShipment({
      ...base, isLate: true, isHighPriority: true, driverAssigned: false,
      lastUpdateMinutesAgo: 120, status: 'delayed',
    });
    expect(r.score).toBe(100);
  });
});
