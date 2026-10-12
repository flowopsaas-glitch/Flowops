/**
 * Telemetry foundations — pure rules.
 *
 * Everything a device ingest can ever trigger lives here, deterministically:
 * point validation (a bad coordinate must never reach the map), distance maths
 * (haversine — the same formula navigation uses), health thresholds, and alert
 * evaluation with dedupe windows so a jittering sensor cannot spam the console.
 */

export const MAX_INGEST_BATCH = 500;
export const DEFAULT_SPEED_LIMIT_KPH = 85;
export const DEFAULT_BATTERY_THRESHOLD_PCT = 15;
export const SILENT_AFTER_HOURS = 6;
export const CLOCK_SKEW_MINUTES = 5;
export const MAX_POINT_AGE_DAYS = 90;
export const ALERT_DEDUPE_MINUTES = 30;

export interface RawPoint {
  recordedAt?: string | Date;
  lat?: unknown;
  lng?: unknown;
  speedKph?: unknown;
  headingDeg?: unknown;
  odometerKm?: unknown;
  batteryPct?: unknown;
  temperatureC?: unknown;
  doorOpen?: unknown;
  raw?: unknown;
}

export interface NormalisedPoint {
  recordedAt: Date;
  lat: number;
  lng: number;
  speedKph: number | null;
  headingDeg: number | null;
  odometerKm: number | null;
  batteryPct: number | null;
  temperatureC: number | null;
  doorOpen: boolean | null;
  raw: unknown;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
};

/** Validate one point. Returns the normalised point or the list of reasons it was refused. */
export function normalisePoint(raw: RawPoint, asOf: Date = new Date()): { ok: true; point: NormalisedPoint } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];

  const lat = num(raw.lat);
  const lng = num(raw.lng);
  if (lat === null || Number.isNaN(lat) || lat < -90 || lat > 90) reasons.push('lat must be a number between -90 and 90');
  if (lng === null || Number.isNaN(lng) || lng < -180 || lng > 180) reasons.push('lng must be a number between -180 and 180');

  const recordedAt = raw.recordedAt ? new Date(raw.recordedAt) : new Date(asOf);
  if (Number.isNaN(recordedAt.getTime())) reasons.push('recordedAt is not a valid timestamp');
  else {
    if (recordedAt.getTime() > asOf.getTime() + CLOCK_SKEW_MINUTES * 60_000) reasons.push(`recordedAt is more than ${CLOCK_SKEW_MINUTES} minutes in the future`);
    if (recordedAt.getTime() < asOf.getTime() - MAX_POINT_AGE_DAYS * 86_400_000) reasons.push(`recordedAt is older than ${MAX_POINT_AGE_DAYS} days`);
  }

  const speedKph = num(raw.speedKph);
  if (speedKph !== null && (Number.isNaN(speedKph) || speedKph < 0 || speedKph > 1600)) reasons.push('speedKph must be between 0 and 1600');

  const headingDeg = num(raw.headingDeg);
  if (headingDeg !== null && (Number.isNaN(headingDeg) || headingDeg < 0 || headingDeg > 360)) reasons.push('headingDeg must be between 0 and 360');

  const odometerKm = num(raw.odometerKm);
  if (odometerKm !== null && (Number.isNaN(odometerKm) || odometerKm < 0)) reasons.push('odometerKm cannot be negative');

  const batteryPct = num(raw.batteryPct);
  if (batteryPct !== null && (Number.isNaN(batteryPct) || batteryPct < 0 || batteryPct > 100)) reasons.push('batteryPct must be between 0 and 100');

  const temperatureC = num(raw.temperatureC);
  if (temperatureC !== null && (Number.isNaN(temperatureC) || temperatureC < -80 || temperatureC > 150)) reasons.push('temperatureC must be between -80 and 150');

  if (reasons.length) return { ok: false, reasons };

  return {
    ok: true,
    point: {
      recordedAt,
      lat: lat as number,
      lng: lng as number,
      speedKph,
      headingDeg,
      odometerKm,
      batteryPct,
      temperatureC,
      doorOpen: typeof raw.doorOpen === 'boolean' ? raw.doorOpen : null,
      raw: raw.raw ?? undefined,
    },
  };
}

/** Great-circle distance in km (haversine, R = 6371.0088 — the IUGG mean Earth radius). */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Distance travelled over an ordered (oldest → newest) trail. */
export function distanceKmOver(points: ReadonlyArray<{ lat: number; lng: number }>): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += haversineKm(points[i - 1], points[i]);
  return Math.round(total * 100) / 100;
}

export interface AlertDeviceLike {
  speedLimitKph?: number | null;
  batteryThresholdPct?: number | null;
}

export interface ProposedAlert {
  kind: 'SPEED_EXCEEDED' | 'BATTERY_LOW';
  message: string;
  value: number;
  threshold: number;
}

/** Health alerts a single ingested point can justify. Silence is computed elsewhere (it needs time, not a point). */
export function evaluateIngestAlerts(device: AlertDeviceLike, point: { speedKph?: number | null; batteryPct?: number | null }): ProposedAlert[] {
  const out: ProposedAlert[] = [];
  const speedLimit = device.speedLimitKph ?? DEFAULT_SPEED_LIMIT_KPH;
  if (point.speedKph != null && point.speedKph > speedLimit) {
    out.push({
      kind: 'SPEED_EXCEEDED',
      message: `Speed ${Math.round(point.speedKph)} kph exceeds the ${Math.round(speedLimit)} kph limit.`,
      value: point.speedKph,
      threshold: speedLimit,
    });
  }
  const batteryFloor = device.batteryThresholdPct ?? DEFAULT_BATTERY_THRESHOLD_PCT;
  if (point.batteryPct != null && point.batteryPct < batteryFloor) {
    out.push({
      kind: 'BATTERY_LOW',
      message: `Battery at ${Math.round(point.batteryPct)}% is below the ${Math.round(batteryFloor)}% floor.`,
      value: point.batteryPct,
      threshold: batteryFloor,
    });
  }
  return out;
}

/** A device that has not reported within the silence window is a coverage problem, not a crime. */
export function isSilent(lastSeenAt: Date | string | null | undefined, asOf: Date = new Date()): boolean {
  if (!lastSeenAt) return true;
  const seen = typeof lastSeenAt === 'string' ? new Date(lastSeenAt) : lastSeenAt;
  return asOf.getTime() - seen.getTime() > SILENT_AFTER_HOURS * 3_600_000;
}

/** Dedupe window: don't raise the same kind again while an open one is recent. */
export function shouldRaiseAlert(
  existing: ReadonlyArray<{ kind: string; status: string; raisedAt: Date | string }>,
  kind: string,
  asOf: Date = new Date(),
): boolean {
  return !existing.some((a) => a.kind === kind && a.status === 'OPEN'
    && asOf.getTime() - new Date(a.raisedAt).getTime() < ALERT_DEDUPE_MINUTES * 60_000);
}
