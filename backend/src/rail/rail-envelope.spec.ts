import { EnvelopeCorridor, EnvelopeSubject, axleLoadBand, axleLoadOf, checkEnvelope, wagonToSubject } from './rail-envelope';
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
  it('a grossly overweight wagon is INCOMPATIBLE on every REAL catalog corridor now that limits are loaded', () => {
    // This test used to assert UNVERIFIED for all six, because Chapter 2 of the Network
    // Statement had never been supplied. It has been: the limits are real now, so a 99 t
    // axle can no longer be waved through on the grounds that nobody knows the limit.
    for (const c of CORRIDOR_CATALOG) {
      const r = checkEnvelope(c, [wagon({ axleLoadTonnes: 99, gauge: 'STANDARD_1435MM' })]);
      expect(`${c.code}: ${r.status}`).toBe(`${c.code}: INCOMPATIBLE`);
      expect(r.violations.map((v) => v.code)).toContain('AXLE_LOAD_EXCEEDED');
    }
  });

  it('still says the corridor is not VERIFIED, because PARTIAL is not VERIFIED', () => {
    const r = checkEnvelope(CORRIDOR_CATALOG[0], [wagon({ axleLoadTonnes: 10 })]);
    expect(r.corridorVerified).toBe(false);
    expect(r.status).toBe('UNVERIFIED');
    expect(r.warnings.join() + r.unverified.join()).toMatch(/PARTIAL/);
  });

  describe('axle load is a band, not a number (North: 18.5 / 20 / 26 t)', () => {
    const north = CORRIDOR_CATALOG.find((c) => c.code === 'COR-NORTH')!;
    const subject = (t: number) => [wagon({ axleLoadTonnes: t })];

    it('clears an axle load at or below the floor, which is safe on every section', () => {
      const r = checkEnvelope(north, subject(18.5));
      expect(r.violations).toEqual([]);
      expect(r.warnings.map((w) => w.code)).not.toContain('AXLE_LOAD_EXCEEDED');
    });

    it('rejects an axle load above the ceiling — cleared nowhere on the corridor', () => {
      const r = checkEnvelope(north, subject(27));
      expect(r.violations.map((v) => v.code)).toEqual(['AXLE_LOAD_EXCEEDED']);
    });

    it('WARNS inside the band and names the sections that ARE cleared for it', () => {
      // 26 t is lawful on the Blackhill–Ogies–Ermelo–Richards Bay and Trichardt–Ermelo
      // stretches and unlawful on Empangeni–Nkwalini, so the answer depends on the route.
      const r = checkEnvelope(north, subject(26));
      expect(r.violations).toEqual([]);
      const w = r.warnings.find((x) => x.code === 'AXLE_LOAD_EXCEEDED')!;
      expect(w.severity).toBe('WARNING');
      expect(w.message).toMatch(/Blackhill/);
    });

    it('is the band that makes 20 t a warning on North, not a pass', () => {
      // 20 t is the corridor's GENERAL limit, but North publishes an 18.5 t section, so
      // even the general figure is not automatically safe everywhere.
      const r = checkEnvelope(north, subject(20));
      const w = r.warnings.find((x) => x.code === 'AXLE_LOAD_EXCEEDED')!;
      expect(w.severity).toBe('WARNING');
      expect(w.limit).toBe(18.5);
    });

    it('axleLoadBand collapses a corridor with no exceptions to a single point', () => {
      const central = CORRIDOR_CATALOG.find((c) => c.code === 'COR-CENTRAL')!;
      const b = axleLoadBand(central.maxAxleLoadTonnes ?? null, central.envelopeExceptions ?? []);
      expect(b).toMatchObject({ floorTonnes: 20, ceilingTonnes: 20 });
      expect(b!.upgraded).toEqual([]);
    });

    it('axleLoadBand is null when nothing is known', () => {
      expect(axleLoadBand(null, [])).toBeNull();
    });
  });

  describe('Cape is predominantly Cape gauge but has 610 mm branches', () => {
    const cape = CORRIDOR_CATALOG.find((c) => c.code === 'COR-CAPE')!;

    // Cape's band is 16.5–20 t, so 16.5 t keeps the axle load out of the way of the gauge test.
    it('rejects an off-corridor gauge outright', () => {
      const r = checkEnvelope(cape, [wagon({ gauge: 'STANDARD_1435MM', axleLoadTonnes: 16.5 })]);
      expect(r.violations.map((v) => v.code)).toContain('GAUGE_MISMATCH');
    });

    it('WARNS rather than rejects for the 610 mm branches the document records', () => {
      const r = checkEnvelope(cape, [wagon({ gauge: 'NARROW_610MM', axleLoadTonnes: 16.5 })]);
      expect(r.violations).toEqual([]);
      const w = r.warnings.find((x) => x.code === 'GAUGE_MISMATCH')!;
      expect(w.severity).toBe('WARNING');
      expect(w.message).toMatch(/Avontuur|Patensie|Gamtoos/);
    });
  });
  it('stamps the time it was checked', () => {
    expect(checkEnvelope(verified, [wagon()], new Date('2026-10-02T10:00:00Z')).checkedAt).toBe('2026-10-02T10:00:00.000Z');
  });
});
