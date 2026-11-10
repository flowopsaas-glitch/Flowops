import type { RailElectrification, RailGauge, RailVehicleProfile } from '@prisma/client';
import { CorridorEnvelopeException, RAIL_VEHICLE_PROFILE_ORDER } from './rail-reference';

/**
 * The axle-load limits a corridor states, as a BAND rather than a single number.
 *
 * Network Statement Chapter 2 gives a general axle load and then departs from it by section:
 * North is 20 t generally, 26 t on the Blackhill–Ogies–Ermelo–Richards Bay and Trichardt–
 * Ermelo stretches, and 18.5 t Empangeni–Nkwalini. Those departures are safety numbers, so
 * the check is deliberately three-valued:
 *
 *   above the band  → VIOLATION. Not cleared anywhere on the corridor.
 *   inside the band → WARNING. Cleared on SOME sections only; the route decides, and a
 *                     machine cannot tell which sections this train will traverse.
 *   at or below the floor → cleared for every section the document rates.
 *
 * A single corridor-level number could only ever be wrong here: taking the maximum would
 * clear an overweight train onto an 18.5 t section, and taking the minimum would reject the
 * 26 t export route the document explicitly sanctions.
 */
export interface AxleLoadBand {
  /** Lowest limit the document states anywhere on the corridor — safe on every section. */
  floorTonnes: number;
  /** Highest limit the document states anywhere on the corridor. */
  ceilingTonnes: number;
  /** The sections cleared above the floor, so the warning can say where it IS allowed. */
  upgraded: CorridorEnvelopeException[];
}

/**
 * Corridor-envelope compatibility: does this rolling stock fit this corridor?
 *
 * Three outcomes, deliberately not two:
 *   COMPATIBLE   — every checked limit is known on BOTH sides and satisfied
 *   INCOMPATIBLE — a gauge or axle-load limit is known on both sides and violated  → REJECT
 *   UNVERIFIED   — a limit is unknown on either side, or the corridor's reference data is not
 *                  VERIFIED. This is NOT a pass. FlowOps never claims a wagon fits a corridor
 *                  whose limits nobody has loaded.
 *
 * Only gauge and axle load can reject (the brief's criteria). Vehicle profile, train length
 * and traction type produce WARNINGS: the profile order is unverified, and the train-length
 * and traction limits may be section-specific.
 */

export type EnvelopeStatus = 'COMPATIBLE' | 'INCOMPATIBLE' | 'UNVERIFIED';
export type EnvelopeFindingCode =
  | 'GAUGE_MISMATCH' | 'AXLE_LOAD_EXCEEDED' | 'PROFILE_EXCEEDS_CORRIDOR' | 'TRAIN_TOO_LONG' | 'TRACTION_NOT_SUPPORTED';

export interface EnvelopeCorridor {
  code: string;
  name?: string;
  gauge?: RailGauge | null;
  electrification?: string[] | null;
  maxAxleLoadTonnes?: number | null;
  vehicleProfile?: RailVehicleProfile | null;
  maxTrainLengthM?: number | null;
  dataStatus?: 'SOURCE_PENDING' | 'PARTIAL' | 'VERIFIED' | null;
  /** Section-level departures from the corridor-level envelope. */
  envelopeExceptions?: CorridorEnvelopeException[] | null;
}

export interface EnvelopeSubject {
  /** e.g. a wagon number, or "application" */
  label?: string;
  gauge?: RailGauge | null;
  axleLoadTonnes?: number | null;
  vehicleProfile?: RailVehicleProfile | null;
  trainLengthM?: number | null;
  tractionType?: RailElectrification | null;
}

export interface EnvelopeFinding {
  code: EnvelopeFindingCode;
  severity: 'VIOLATION' | 'WARNING';
  subject?: string;
  message: string;
  actual?: number | string;
  limit?: number | string;
}

export interface EnvelopeResult {
  status: EnvelopeStatus;
  corridorCode: string | null;
  corridorVerified: boolean;
  /** Hard violations (gauge / axle load) — non-empty ⇒ INCOMPATIBLE. */
  violations: EnvelopeFinding[];
  warnings: EnvelopeFinding[];
  /** Human-readable list of what could not be checked. */
  unverified: string[];
  subjectsChecked: number;
  checkedAt: string;
}

const EPS = 1e-9;

/**
 * Fold a corridor's general axle load and its section exceptions into one band.
 * Returns null when nothing is known on either side.
 */
export function axleLoadBand(
  generalTonnes: number | null,
  exceptions?: readonly CorridorEnvelopeException[] | null,
): AxleLoadBand | null {
  const all = [
    ...(generalTonnes == null ? [] : [generalTonnes]),
    // Null-tolerant: a corridor row written before this column existed reads back as NULL,
    // and a default parameter would not catch an explicit null.
    ...(exceptions ?? []).filter((e) => e.kind === 'AXLE_LOAD' && typeof e.tonnes === 'number').map((e) => e.tonnes as number),
  ];
  if (all.length === 0) return null;
  const floorTonnes = Math.min(...all);
  const ceilingTonnes = Math.max(...all);
  return {
    floorTonnes,
    ceilingTonnes,
    upgraded: (exceptions ?? []).filter((e) => e.kind === 'AXLE_LOAD' && (e.tonnes ?? 0) > floorTonnes + EPS),
  };
}

/** Axle load of a wagon = (tare + loaded) / axles, only when all three are known and positive. */
export function axleLoadOf(w: { tareTonnes?: number | null; loadedTonnes?: number | null; axles?: number | null }): number | null {
  const { tareTonnes: tare, loadedTonnes: loaded, axles } = w;
  if (tare == null || loaded == null || axles == null || axles <= 0 || tare < 0 || loaded < 0) return null;
  return (tare + loaded) / axles;
}

export function wagonToSubject(w: {
  wagonNumber: string;
  tareTonnes?: number | null;
  loadedTonnes?: number | null;
  axles?: number | null;
  gauge?: RailGauge | null;
  vehicleProfile?: RailVehicleProfile | null;
}): EnvelopeSubject {
  return { label: w.wagonNumber, gauge: w.gauge ?? null, vehicleProfile: w.vehicleProfile ?? null, axleLoadTonnes: axleLoadOf(w) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pure. `corridor` undefined ⇒ UNVERIFIED (unknown corridor). */
export function checkEnvelope(
  corridor: EnvelopeCorridor | undefined | null,
  subjects: readonly EnvelopeSubject[],
  now: Date = new Date(),
): EnvelopeResult {
  const base = { subjectsChecked: subjects.length, checkedAt: now.toISOString() };
  if (!corridor) {
    return {
      ...base, status: 'UNVERIFIED', corridorCode: null, corridorVerified: false, violations: [], warnings: [],
      unverified: ['The corridor is not in the reference catalog, so no limits can be applied.'],
    };
  }
  const verified = corridor.dataStatus === 'VERIFIED';
  const exceptions = corridor.envelopeExceptions ?? [];
  const band = axleLoadBand(corridor.maxAxleLoadTonnes ?? null, exceptions);
  const findings: EnvelopeFinding[] = [];
  const missing = { gauge: [] as string[], axle: [] as string[] };
  const corridorUnknown: string[] = [];

  if (corridor.gauge == null) corridorUnknown.push('gauge');
  if (!band) corridorUnknown.push('maximum axle load');

  for (const s of subjects) {
    const label = s.label ?? 'subject';
    if (corridor.gauge != null) {
      if (s.gauge == null) missing.gauge.push(label);
      else if (s.gauge !== corridor.gauge) {
        // A corridor may be predominantly one gauge with narrow-gauge branches (Cape is
        // 1 065 mm "predominantly" but 610 mm on the Avontuur and Patensie branches). A
        // train built for a recorded branch gauge is possible-but-unusual, so it warns
        // instead of rejecting — the gauge column alone cannot say which lines it may use.
        const branch = exceptions.find((e) => e.kind === 'GAUGE' && e.gauge === s.gauge);
        findings.push({
          code: 'GAUGE_MISMATCH',
          severity: branch ? 'WARNING' : 'VIOLATION',
          subject: label, actual: s.gauge, limit: corridor.gauge,
          message: branch
            ? `${label}: gauge ${s.gauge} does not match the ${corridor.name ?? corridor.code} corridor's predominant gauge ${corridor.gauge}, but the document records ${s.gauge} for ${branch.sections} — confirm the train stays on those lines.`
            : `${label}: gauge ${s.gauge} does not match the ${corridor.name ?? corridor.code} corridor gauge ${corridor.gauge}.`,
        });
      }
    }
    if (band) {
      if (s.axleLoadTonnes == null) missing.axle.push(label);
      else if (s.axleLoadTonnes > band.ceilingTonnes + EPS) {
        findings.push({ code: 'AXLE_LOAD_EXCEEDED', severity: 'VIOLATION', subject: label, actual: round2(s.axleLoadTonnes), limit: band.ceilingTonnes,
          message: `${label}: axle load ${round2(s.axleLoadTonnes)} t exceeds the highest limit the ${corridor.name ?? corridor.code} corridor publishes (${band.ceilingTonnes} t) by ${round2(s.axleLoadTonnes - band.ceilingTonnes)} t — it is not cleared for any section of this corridor.` });
      } else if (s.axleLoadTonnes > band.floorTonnes + EPS) {
        const where = band.upgraded
          .filter((e) => (e.tonnes ?? 0) >= s.axleLoadTonnes! - EPS)
          .map((e) => e.sections)
          .join('; ') || 'the more heavily cleared sections';
        findings.push({ code: 'AXLE_LOAD_EXCEEDED', severity: 'WARNING', subject: label, actual: round2(s.axleLoadTonnes), limit: band.floorTonnes,
          message: `${label}: axle load ${round2(s.axleLoadTonnes)} t exceeds the ${band.floorTonnes} t floor the ${corridor.name ?? corridor.code} corridor clears for every section. It is cleared only for ${where} — confirm the route before accepting.` });
      }
    }
    if (corridor.vehicleProfile != null && s.vehicleProfile != null) {
      const have = RAIL_VEHICLE_PROFILE_ORDER.indexOf(s.vehicleProfile);
      const lim = RAIL_VEHICLE_PROFILE_ORDER.indexOf(corridor.vehicleProfile);
      if (have > lim) {
        findings.push({ code: 'PROFILE_EXCEEDS_CORRIDOR', severity: 'WARNING', subject: label, actual: s.vehicleProfile, limit: corridor.vehicleProfile,
          message: `${label}: vehicle profile ${s.vehicleProfile} is larger than the corridor profile ${corridor.vehicleProfile} (profile order A < B < B+1 is unverified — advisory only).` });
      }
    }
    if (corridor.maxTrainLengthM != null && s.trainLengthM != null && s.trainLengthM > corridor.maxTrainLengthM) {
      findings.push({ code: 'TRAIN_TOO_LONG', severity: 'WARNING', subject: label, actual: s.trainLengthM, limit: corridor.maxTrainLengthM,
        message: `${label}: train length ${s.trainLengthM} m exceeds the corridor maximum of ${corridor.maxTrainLengthM} m (advisory — limits can be section-specific).` });
    }
    if (s.tractionType && corridor.electrification?.length && !corridor.electrification.includes(s.tractionType)) {
      findings.push({ code: 'TRACTION_NOT_SUPPORTED', severity: 'WARNING', subject: label, actual: s.tractionType, limit: corridor.electrification.join('/'),
        message: `${label}: traction ${s.tractionType} is not among the corridor's supported traction (${corridor.electrification.join(', ')}).` });
    }
  }

  const unverified: string[] = [];
  if (!verified) {
    // A PARTIAL corridor has real, cited limits — only some of them. Saying "limits cannot
    // be relied on" overstates it, and saying nothing at all understates it.
    unverified.push(
      corridor.dataStatus === 'PARTIAL'
        ? `The ${corridor.name ?? corridor.code} corridor's reference data is PARTIAL: the loaded limits come from the published Network Statement, but the corridor is not fully reviewed and some fields (vehicle profile, gradients) were never supplied. Treat the limits as published, not as signed off.`
        : `The ${corridor.name ?? corridor.code} corridor's reference data is not VERIFIED (${corridor.dataStatus ?? 'unknown'}); limits cannot be relied on.`,
    );
  }
  for (const k of corridorUnknown) unverified.push(`The corridor's ${k} is not loaded.`);
  const list = (names: string[]) => (names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} +${names.length - 3} more`);
  if (missing.gauge.length) unverified.push(`Gauge not declared for ${missing.gauge.length} item(s): ${list(missing.gauge)}.`);
  if (missing.axle.length) unverified.push(`Axle load cannot be computed for ${missing.axle.length} item(s) (needs tare, loaded weight and axle count): ${list(missing.axle)}.`);
  if (subjects.length === 0) unverified.push('No rolling stock was supplied to check.');

  let violations = findings.filter((f) => f.severity === 'VIOLATION');
  let warnings = findings.filter((f) => f.severity === 'WARNING');
  /**
   * Corridor data that has been loaded from a cited source may reject. Data that has not
   * been loaded at all may not.
   *
   * Both VERIFIED and PARTIAL mean "the limits came from a cited source" — and the two
   * criteria that can reject, gauge and axle load, are precisely the fields Chapter 2 of
   * the Network Statement supplies for all six corridors. What makes a corridor PARTIAL is
   * the vehicle profile and the gradients, and neither of those can ever reject: they are
   * advisory by construction. Suppressing a genuine axle-load rejection because of a
   * missing advisory field would leave a 99 t axle load sailing through a 20 t corridor
   * on the strength of a formality.
   *
   * So the test is whether the data is CITED, not whether it is fully reviewed. The
   * PARTIAL caveat still travels with the result (see `unverified` above), so nobody is
   * told the corridor is signed off when it is not.
   */
  const mayReject = corridor.dataStatus === 'VERIFIED' || corridor.dataStatus === 'PARTIAL';
  if (!mayReject) {
    // Unverified reference data may inform, but it never rejects.
    warnings = [...violations.map((v) => ({ ...v, severity: 'WARNING' as const, message: `(corridor data unverified) ${v.message}` })), ...warnings];
    violations = [];
  }
  const status: EnvelopeStatus = violations.length ? 'INCOMPATIBLE' : unverified.length ? 'UNVERIFIED' : 'COMPATIBLE';
  return { ...base, status, corridorCode: corridor.code, corridorVerified: verified, violations, warnings, unverified };
}
