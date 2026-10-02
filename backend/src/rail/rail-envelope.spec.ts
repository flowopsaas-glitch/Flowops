import { EnvelopeCorridor, EnvelopeSubject, axleLoadOf, checkEnvelope, wagonToSubject } from './rail-envelope';
import { CORRIDOR_CATALOG } from './catalog/corridors.catalog';

/** SYNTHETIC fixture for the engine tests — these numbers are NOT corridor data. */
const verified: EnvelopeCorridor = {
  code: 'COR-TEST', name: 'Test corridor', gauge: 'CAPE_1067MM', electrification: ['DC_3KV', 'DIESEL'],
  maxAxleLoadTonnes: 26, vehicleProfile: 'B', maxTrainLengthM: 1500, dataStatus: 'VERIFIED',
};
const wagon = (over: Partial<EnvelopeSubject> = {}): EnvelopeSubject => ({
  label: 'W1', gauge: 'CAPE_1067MM', axleLoadTonnes: 24, vehicleProfile: 'B', ...over,
});

describe('axleLoadOf / wagonToSubject', () => {
  it('is (tare + loaded) / axles', () => expect(axleLoadOf({ tareTonnes: 24, loadedTonnes: 80, axles: 4 })).toBe(26));
  it.each([
    [{ tareTonnes: null, loadedTonnes: 80, axles: 4 }],
    [{ tareTonnes: 24, loadedTonnes: undefined, axles: 4 }],
    [{ tareTonnes: 24, loadedTonnes: 80, axles: 0 }],
    [{ tareTonnes: 24, loadedTonnes: 80, axles: null }],
    [{ tareTonnes: -1, loadedTonnes: 80, axles: 4 }],
  ])('is unknown (null) when any input is missing or invalid: %j', (w) => expect(axleLoadOf(w as never)).toBeNull());
  it('maps a wagon row to a subject', () => {
    expect(wagonToSubject({ wagonNumber: 'SAR-1', tareTonnes: 20, loadedTonnes: 60, axles: 4, gauge: 'CAPE_1067MM' }))
      .toEqual({ label: 'SAR-1', gauge: 'CAPE_1067MM', vehicleProfile: null, axleLoadTonnes: 20 });
  });
});

describe('checkEnvelope — verified corridor', () => {
  it('COMPATIBLE when every limit is known and satisfied', () => {
    const r = checkEnvelope(verified, [wagon()]);
    expect(r).toMatchObject({ status: 'COMPATIBLE', violations: [], warnings: [], unverified: [], corridorVerified: true, corridorCode: 'COR-TEST', subjectsChecked: 1 });
  });
  it('an axle load exactly AT the limit is allowed; just over is rejected, with the excess stated', () => {
    expect(checkEnvelope(verified, [wagon({ axleLoadTonnes: 26 })]).status).toBe('COMPATIBLE');
    const r = checkEnvelope(verified, [wagon({ axleLoadTonnes: 26.01 })]);
    expect(r.status).toBe('INCOMPATIBLE');
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0]).toMatchObject({ code: 'AXLE_LOAD_EXCEEDED', severity: 'VIOLATION', subject: 'W1', limit: 26, actual: 26.01 });
    expect(r.violations[0].message).toContain('by 0.01 t');
  });
  it('rejects a gauge mismatch', () => {
    const r = checkEnvelope(verified, [wagon({ gauge: 'STANDARD_1435MM' })]);
    expect(r.status).toBe('INCOMPATIBLE');
    expect(r.violations[0]).toMatchObject({ code: 'GAUGE_MISMATCH', actual: 'STANDARD_1435MM', limit: 'CAPE_1067MM' });
  });
  it('reports every offending wagon, and passes the good ones', () => {
    const r = checkEnvelope(verified, [wagon({ label: 'OK' }), wagon({ label: 'HEAVY', axleLoadTonnes: 30 }), wagon({ label: 'WIDE', gauge: 'NARROW_610MM' })]);
    expect(r.violations.map((v) => `${v.subject}:${v.code}`).sort()).toEqual(['HEAVY:AXLE_LOAD_EXCEEDED', 'WIDE:GAUGE_MISMATCH']);
    expect(r.subjectsChecked).toBe(3);
  });
  it('a wagon with undeclared gauge or an uncomputable axle load is UNVERIFIED — never "compatible"', () => {
    const noGauge = checkEnvelope(verified, [wagon({ gauge: null })]);
    expect(noGauge.status).toBe('UNVERIFIED');
    expect(noGauge.unverified.join()).toMatch(/Gauge not declared for 1 item/);
    const noAxle = checkEnvelope(verified, [wagon({ axleLoadTonnes: null })]);
    expect(noAxle.status).toBe('UNVERIFIED');
    expect(noAxle.unverified.join()).toMatch(/Axle load cannot be computed/);
  });
  it('a violation beats an unverified item (INCOMPATIBLE wins)', () => {
    const r = checkEnvelope(verified, [wagon({ axleLoadTonnes: 40 }), wagon({ label: 'W2', gauge: null })]);
    expect(r.status).toBe('INCOMPATIBLE');
    expect(r.unverified.length).toBeGreaterThan(0);
  });
  it('summarises long lists of undeclared items instead of dumping them', () => {
    const many = Array.from({ length: 7 }, (_, i) => wagon({ label: `W${i}`, gauge: null }));
    expect(checkEnvelope(verified, many).unverified.join()).toMatch(/7 item\(s\): W0, W1, W2 \+4 more/);
  });

  describe('advisory findings (never reject)', () => {
    it('a larger vehicle profile is a warning only', () => {
      const r = checkEnvelope(verified, [wagon({ vehicleProfile: 'B_PLUS_1' })]);
      expect(r.status).toBe('COMPATIBLE');
      expect(r.warnings[0]).toMatchObject({ code: 'PROFILE_EXCEEDS_CORRIDOR', severity: 'WARNING' });
      expect(r.warnings[0].message).toMatch(/unverified/);
    });
    it('an equal or smaller profile raises nothing', () => {
      expect(checkEnvelope(verified, [wagon({ vehicleProfile: 'B' }), wagon({ vehicleProfile: 'A', label: 'W2' })]).warnings).toEqual([]);
    });
    it('a train over the maximum length is a warning only', () => {
      const r = checkEnvelope(verified, [wagon({ trainLengthM: 1600 })]);
      expect(r.status).toBe('COMPATIBLE');
      expect(r.warnings[0]).toMatchObject({ code: 'TRAIN_TOO_LONG', actual: 1600, limit: 1500 });
    });
    it('a traction type the corridor does not list is a warning only', () => {
      const r = checkEnvelope(verified, [wagon({ tractionType: 'AC_25KV' })]);
      expect(r.status).toBe('COMPATIBLE');
      expect(r.warnings[0]).toMatchObject({ code: 'TRACTION_NOT_SUPPORTED' });
      expect(checkEnvelope(verified, [wagon({ tractionType: 'DIESEL' })]).warnings).toEqual([]);
    });
  });
});

describe('checkEnvelope — reference data that is not (fully) there', () => {
  it('a SOURCE_PENDING corridor NEVER rejects: would-be violations are downgraded to warnings and the result is UNVERIFIED', () => {
    const pending: EnvelopeCorridor = { ...verified, dataStatus: 'SOURCE_PENDING' };
    const r = checkEnvelope(pending, [wagon({ axleLoadTonnes: 40, gauge: 'STANDARD_1435MM' })]);
    expect(r.status).toBe('UNVERIFIED');
    expect(r.violations).toEqual([]);
    expect(r.corridorVerified).toBe(false);
    expect(r.warnings.map((w) => w.code).sort()).toEqual(['AXLE_LOAD_EXCEEDED', 'GAUGE_MISMATCH']);
    expect(r.warnings.every((w) => w.message.startsWith('(corridor data unverified)'))).toBe(true);
    expect(r.unverified.join()).toMatch(/not VERIFIED/);
  });
  it('a verified corridor with a missing limit cannot confirm compatibility', () => {
    const r = checkEnvelope({ ...verified, maxAxleLoadTonnes: null }, [wagon()]);
    expect(r.status).toBe('UNVERIFIED');
    expect(r.unverified.join()).toMatch(/maximum axle load is not loaded/);
    const r2 = checkEnvelope({ ...verified, gauge: null }, [wagon()]);
    expect(r2.unverified.join()).toMatch(/gauge is not loaded/);
  });
  it('an unknown corridor is UNVERIFIED with no code', () => {
    const r = checkEnvelope(undefined, [wagon()]);
    expect(r).toMatchObject({ status: 'UNVERIFIED', corridorCode: null, corridorVerified: false });
  });
  it('nothing to check is UNVERIFIED, not COMPATIBLE', () => {
    expect(checkEnvelope(verified, []).status).toBe('UNVERIFIED');
  });
  it('every REAL catalog corridor is currently UNVERIFIED and never INCOMPATIBLE — the honest state until data is supplied', () => {
    for (const c of CORRIDOR_CATALOG) {
      const r = checkEnvelope(c, [wagon({ axleLoadTonnes: 99, gauge: 'STANDARD_1435MM' })]);
      expect(r.status).toBe('UNVERIFIED');
      expect(r.violations).toEqual([]);
    }
  });
  it('stamps the time it was checked', () => {
    expect(checkEnvelope(verified, [wagon()], new Date('2026-10-02T10:00:00Z')).checkedAt).toBe('2026-10-02T10:00:00.000Z');
  });
});
