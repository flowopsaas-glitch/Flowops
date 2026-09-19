import { RoutingService, Stop } from './routing.service';

/**
 * Unit tests for the route-optimization engine. optimize() is pure (it never
 * touches Prisma), so we instantiate the service with a null dependency.
 */
describe('RoutingService.optimize', () => {
  const svc = new RoutingService(null as any, null as any);

  it('returns an empty route for no stops', async () => {
    const r = await svc.optimize([]);
    expect(r.order).toEqual([]);
    expect(r.stops).toEqual([]);
    expect(r.totalKm).toBe(0);
  });

  it('filters out stops with non-finite coordinates', async () => {
    const stops: Stop[] = [
      { id: 'good', lat: 0, lng: 0 },
      { id: 'bad', lat: NaN, lng: 10 },
    ];
    const r = await svc.optimize(stops);
    expect(r.order).toEqual(['good']);
  });

  it('includes every valid stop exactly once in the order', async () => {
    const stops: Stop[] = [
      { id: 'a', lat: 0, lng: 0 },
      { id: 'b', lat: 0, lng: 2 },
      { id: 'c', lat: 0, lng: 1 },
      { id: 'd', lat: 0, lng: 3 },
    ];
    const r = await svc.optimize(stops);
    expect([...r.order].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('sequences co-linear stops in nearest order when given a start point', async () => {
    // Points along the equator at lng 3,1,2 — optimal from origin is 1,2,3.
    const stops: Stop[] = [
      { id: 's3', lat: 0, lng: 3 },
      { id: 's1', lat: 0, lng: 1 },
      { id: 's2', lat: 0, lng: 2 },
    ];
    const r = await svc.optimize(stops, { lat: 0, lng: 0 });
    expect(r.order).toEqual(['s1', 's2', 's3']);
  });

  it('totalKm equals the sum of per-leg distances', async () => {
    const stops: Stop[] = [
      { id: 'a', lat: 0, lng: 0 },
      { id: 'b', lat: 0, lng: 1 },
      { id: 'c', lat: 0, lng: 2 },
    ];
    const r = await svc.optimize(stops, { lat: 0, lng: 0 });
    const sumLegs = Math.round(r.stops.reduce((s, st) => s + st.legKm, 0) * 100) / 100;
    expect(r.totalKm).toBe(sumLegs);
  });

  it('assigns the first stop a zero leg when no start point is provided', async () => {
    const stops: Stop[] = [
      { id: 'a', lat: 0, lng: 0 },
      { id: 'b', lat: 0, lng: 1 },
    ];
    const r = await svc.optimize(stops);
    expect(r.startedFrom).toBeNull();
    expect(r.stops[0].legKm).toBe(0);
  });

  it('produces a route no longer than the naive input order (2-opt never regresses)', async () => {
    // A deliberately zig-zag set; optimized length should be <= input-order length.
    const stops: Stop[] = [
      { id: 'a', lat: 0, lng: 0 },
      { id: 'b', lat: 0, lng: 3 },
      { id: 'c', lat: 0, lng: 1 },
      { id: 'd', lat: 0, lng: 2 },
    ];
    const start = { lat: 0, lng: 0 };
    // Naive length following input order a,b,c,d
    const naive = naiveLength([start, ...stops.map((s) => ({ lat: s.lat, lng: s.lng }))]);
    const r = await svc.optimize(stops, start);
    expect(r.totalKm).toBeLessThanOrEqual(naive + 1e-6);
  });
});

// Simple sequential path length using the same haversine the service uses.
function naiveLength(points: Array<{ lat: number; lng: number }>): number {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { GeocodingService } = require('../geocoding/geocoding.service');
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += GeocodingService.haversineKm(
      points[i - 1].lat,
      points[i - 1].lng,
      points[i].lat,
      points[i].lng,
    );
  }
  return Math.round(total * 100) / 100;
}
