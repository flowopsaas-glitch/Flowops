import { GeocodingService } from './geocoding.service';

/**
 * Unit tests for the pure great-circle distance helper that the routing,
 * tracking-ETA and driver-proximity features all depend on.
 */
describe('GeocodingService.haversineKm', () => {
  it('returns 0 for identical coordinates', () => {
    expect(GeocodingService.haversineKm(-26.2041, 28.0473, -26.2041, 28.0473)).toBe(0);
  });

  it('is symmetric (a->b equals b->a)', () => {
    const ab = GeocodingService.haversineKm(-26.2041, 28.0473, -33.9249, 18.4241);
    const ba = GeocodingService.haversineKm(-33.9249, 18.4241, -26.2041, 28.0473);
    expect(Math.abs(ab - ba)).toBeLessThan(1e-9);
  });

  it('computes ~1 degree of latitude as ~111 km', () => {
    const d = GeocodingService.haversineKm(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  it('computes the Johannesburg -> Cape Town distance (~1260 km) within tolerance', () => {
    const d = GeocodingService.haversineKm(-26.2041, 28.0473, -33.9249, 18.4241);
    expect(d).toBeGreaterThan(1200);
    expect(d).toBeLessThan(1320);
  });

  it('computes a short intra-city hop (Johannesburg -> Pretoria, ~50 km)', () => {
    const d = GeocodingService.haversineKm(-26.2041, 28.0473, -25.7479, 28.2293);
    expect(d).toBeGreaterThan(40);
    expect(d).toBeLessThan(60);
  });
});
