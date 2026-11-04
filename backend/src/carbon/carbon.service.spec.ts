import { CarbonService } from './carbon.service';

/**
 * The carbon module had no tests, which is how a one-word gap in its lookup
 * table survived: the schema default for `Driver.vehicleType` is "motorbike",
 * it was not a key in VEHICLE_MAP, and the fallback is the average diesel van.
 *
 * These tests are about the mapping table rather than the arithmetic — the
 * arithmetic is DEFRA factors applied literally. What matters is that every
 * vehicle string this platform can actually produce resolves to a real factor
 * instead of silently landing on DEFAULT.
 */

const svc = new CarbonService({} as never);

/** Values the driver form can create (frontend VEHICLE_TYPES). */
const UI_VEHICLE_TYPES = ['CAR', 'VAN', 'BAKKIE', 'MOTORCYCLE', 'TRUCK', 'BICYCLE'];

describe('CarbonService.calculateShipment — vehicle mapping', () => {
  it.each(UI_VEHICLE_TYPES)('maps the driver-form value %s to a real factor', (vehicleType) => {
    const result = svc.calculateShipment(100, vehicleType);
    expect(result.vehicleType).not.toBe('DEFAULT');
  });

  it('maps the schema default "motorbike" instead of falling back to a van', () => {
    // Driver.vehicleType @default("motorbike")
    const result = svc.calculateShipment(100, 'motorbike');
    expect(result.vehicleType).toBe('MOTORCYCLE');
    // The van fallback is 2.2x the motorcycle factor — a material overstatement
    // in a report a client may use for Scope 3 disclosure.
    expect(result.emissionFactor).toBeLessThan(0.2);
  });

  it('is case-insensitive, because the UI stores upper case and seeds may not', () => {
    expect(svc.calculateShipment(10, 'BAKKIE').vehicleType).toBe('VAN_DIESEL');
    expect(svc.calculateShipment(10, 'bakkie').vehicleType).toBe('VAN_DIESEL');
    expect(svc.calculateShipment(10, 'Bakkie').vehicleType).toBe('VAN_DIESEL');
  });

  it('treats a bicycle as zero-emission rather than "unknown"', () => {
    const result = svc.calculateShipment(25, 'BICYCLE');
    expect(result.vehicleType).toBe('BICYCLE');
    expect(result.co2Kg).toBe(0);
    expect(result.offsetCostZar).toBe(0);
  });

  it('still falls back to DEFAULT for a genuinely unknown type', () => {
    // An unknown string must not throw on a read path; it must also stay
    // labelled DEFAULT so the report shows the assumption rather than hiding it.
    expect(svc.calculateShipment(10, 'hovercraft').vehicleType).toBe('DEFAULT');
    expect(svc.calculateShipment(10).vehicleType).toBe('DEFAULT');
  });
});

describe('CarbonService.calculateShipment — arithmetic', () => {
  it('scales linearly with distance', () => {
    const short = svc.calculateShipment(10, 'truck');
    const long = svc.calculateShipment(100, 'truck');
    expect(long.co2Kg).toBeCloseTo(short.co2Kg * 10, 1);
  });

  it('applies a weight multiplier only for heavier loads', () => {
    const light = svc.calculateShipment(100, 'truck', 1);
    const base = svc.calculateShipment(100, 'truck');
    const heavy = svc.calculateShipment(100, 'truck', 500);
    expect(light.co2Kg).toBeLessThan(base.co2Kg);
    expect(heavy.co2Kg).toBeGreaterThan(base.co2Kg);
  });

  it('converts kg to tonnes and prices the offset consistently', () => {
    const result = svc.calculateShipment(1000, 'truck');
    expect(result.co2Tonnes).toBeCloseTo(result.co2Kg / 1000, 4);
    expect(result.offsetCostZar).toBeGreaterThan(0);
  });
});

describe('CarbonService.getFleetReport — the same zero-factor trap, second code path', () => {
  /**
   * The fleet report repeats the lookup inline rather than calling
   * calculateShipment, so it needs its own assertion: a bicycle-only fleet must
   * report zero, not the diesel-van fallback.
   */
  const fleet = (vehicleTypes: string[]) => ({
    waybill: {
      findMany: async () =>
        vehicleTypes.map((vehicleType, i) => ({
          id: `wb-${i}`,
          weight: null,
          senderLat: null,
          senderLng: null,
          recipientLat: null,
          recipientLng: null,
          createdAt: new Date('2026-11-01T08:00:00.000Z'),
          shipments: [{ driver: { vehicleType } }],
        })),
    },
  });

  it('reports zero for a bicycle fleet', async () => {
    const report = await new CarbonService(fleet(['BICYCLE', 'BICYCLE']) as never).getFleetReport('A');
    expect(report.totalCo2Kg).toBe(0);
    expect(report.byVehicleType.BICYCLE.shipments).toBe(2);
  });

  it('labels a bicycle fleet as BICYCLE, not DEFAULT', async () => {
    const report = await new CarbonService(fleet(['bicycle']) as never).getFleetReport('A');
    expect(Object.keys(report.byVehicleType)).toEqual(['BICYCLE']);
  });

  it('still counts a mixed fleet correctly', async () => {
    const report = await new CarbonService(fleet(['BICYCLE', 'TRUCK']) as never).getFleetReport('A');
    expect(report.byVehicleType.BICYCLE.shipments).toBe(1);
    expect(report.byVehicleType.TRUCK_SMALL_DIESEL.shipments).toBe(1);
    expect(report.totalCo2Kg).toBeGreaterThan(0);
  });
});
