import {
  distanceKmOver, evaluateIngestAlerts, haversineKm, isSilent, normalisePoint, shouldRaiseAlert,
  MAX_INGEST_BATCH,
} from './rail-telemetry.rules';

const AS_OF = new Date('2026-10-12T12:00:00Z');
const good = { lat: -26.2, lng: 28.05, speedKph: 62, batteryPct: 88, recordedAt: '2026-10-12T11:55:00Z' };

describe('rail-telemetry.rules — point validation', () => {
  it('normalises a good point and defaults recordedAt to now', () => {
    const r = normalisePoint(good, AS_OF);
    expect(r.ok).toBe(true);
    if ('point' in r) {
      expect(r.point.lat).toBe(-26.2);
      expect(r.point.speedKph).toBe(62);
      expect(r.point.doorOpen).toBeNull();
    }
    const noTime = normalisePoint({ lat: -26.2, lng: 28.05 }, AS_OF);
    expect(noTime.ok).toBe(true);
    if ('point' in noTime) expect(noTime.point.recordedAt.getTime()).toBe(AS_OF.getTime());
  });

  it('refuses coordinates that would break the map', () => {
    for (const bad of [
      { ...good, lat: 200 }, { ...good, lng: -400 }, { ...good, lat: 'x' }, { ...good, lng: null },
    ]) {
      const r = normalisePoint(bad, AS_OF);
      expect(r.ok).toBe(false);
      if ('reasons' in r) expect(r.reasons.join(' ')).toMatch(/lat|lng/);
    }
  });

  it('refuses timestamps from the future beyond clock skew, and fossils', () => {
    const future = normalisePoint({ ...good, recordedAt: '2026-10-12T12:30:00Z' }, AS_OF);
    expect(future.ok).toBe(false);
    const fossil = normalisePoint({ ...good, recordedAt: '2026-06-01T00:00:00Z' }, AS_OF);
    expect(fossil.ok).toBe(false);
    if ('reasons' in fossil) expect(fossil.reasons.join(' ')).toContain('older than');
  });

  it('refuses nonsense sensor readings but allows them to be absent', () => {
    expect(normalisePoint({ ...good, speedKph: -10 }, AS_OF).ok).toBe(false);
    expect(normalisePoint({ ...good, batteryPct: 120 }, AS_OF).ok).toBe(false);
    expect(normalisePoint({ ...good, headingDeg: 400 }, AS_OF).ok).toBe(false);
    expect(normalisePoint({ ...good, temperatureC: -100 }, AS_OF).ok).toBe(false);
    expect(normalisePoint({ lat: -26.2, lng: 28.05 }, AS_OF).ok).toBe(true); // sparse point is fine
  });

  it('keeps the batch cap a hard constant', () => {
    expect(MAX_INGEST_BATCH).toBe(500);
  });
});

describe('rail-telemetry.rules — distance maths', () => {
  it('computes haversine distances to a sane accuracy', () => {
    // Johannesburg → Sishen straight-line: Δlng ≈ 5.2° at lat −27 (~515 km) + Δlat ≈ 1.55° (~172 km)
    // ⇒ hypot ≈ 543 km. (The real rail line is longer; this is the crow-flies check.)
    const jhb = { lat: -26.2041, lng: 28.0473 };
    const sishen = { lat: -27.752, lng: 22.85 };
    const d = haversineKm(jhb, sishen);
    expect(d).toBeGreaterThan(520);
    expect(d).toBeLessThan(560);
    expect(haversineKm(jhb, jhb)).toBe(0);
  });

  it('sums a trail and rounds to metres-grade precision', () => {
    const trail = [
      { lat: -26.2, lng: 28.05 },
      { lat: -26.21, lng: 28.05 },
      { lat: -26.22, lng: 28.05 },
    ];
    expect(distanceKmOver(trail)).toBeCloseTo(2.22, 1);
    expect(distanceKmOver([trail[0]])).toBe(0);
  });
});

describe('rail-telemetry.rules — health alerts', () => {
  it('raises speed and battery alerts against device thresholds', () => {
    const alerts = evaluateIngestAlerts({ speedLimitKph: 80, batteryThresholdPct: 20 }, { speedKph: 95, batteryPct: 12 });
    expect(alerts.map((a) => a.kind)).toEqual(['SPEED_EXCEEDED', 'BATTERY_LOW']);
    expect(alerts[0].threshold).toBe(80);
    expect(alerts[1].threshold).toBe(20);
  });

  it('uses platform defaults when the device has none', () => {
    const alerts = evaluateIngestAlerts({}, { speedKph: 86, batteryPct: 14 });
    expect(alerts.map((a) => a.kind)).toEqual(['SPEED_EXCEEDED', 'BATTERY_LOW']);
  });

  it('stays quiet for healthy readings and absent sensors', () => {
    expect(evaluateIngestAlerts({}, { speedKph: 60, batteryPct: 90 })).toEqual([]);
    expect(evaluateIngestAlerts({}, {})).toEqual([]);
  });

  it('deduplicates an open alert within the window but re-raises after it', () => {
    const openRecent = [{ kind: 'SPEED_EXCEEDED', status: 'OPEN', raisedAt: new Date('2026-10-12T11:45:00Z') }];
    expect(shouldRaiseAlert(openRecent, 'SPEED_EXCEEDED', AS_OF)).toBe(false);
    const openOld = [{ kind: 'SPEED_EXCEEDED', status: 'OPEN', raisedAt: new Date('2026-10-12T11:00:00Z') }];
    expect(shouldRaiseAlert(openOld, 'SPEED_EXCEEDED', AS_OF)).toBe(true);
    const acknowledged = [{ kind: 'SPEED_EXCEEDED', status: 'ACKNOWLEDGED', raisedAt: new Date('2026-10-12T11:45:00Z') }];
    expect(shouldRaiseAlert(acknowledged, 'SPEED_EXCEEDED', AS_OF)).toBe(true);
  });

  it('treats never-seen and stale devices as silent', () => {
    expect(isSilent(null, AS_OF)).toBe(true);
    expect(isSilent(new Date('2026-10-12T11:00:00Z'), AS_OF)).toBe(false);
    expect(isSilent('2026-10-12T04:00:00Z', AS_OF)).toBe(true);
  });
});
