import type {
  RailComplianceDocType, RailElectrification, RailGauge, RailVehicleProfile,
} from '@prisma/client';

/**
 * Shared vocabulary for the rail reference data and the corridor-envelope check.
 *
 * Evidence tags: [BRIEF] = stated in the Wave-2 brief only (no supplied document
 * corroborates it), so it is a configurable rule flagged unverified.
 */

export const RAIL_GAUGE_VALUES: RailGauge[] = ['CAPE_1067MM', 'NARROW_610MM', 'STANDARD_1435MM'];
export const RAIL_GAUGE_LABEL: Record<RailGauge, string> = {
  CAPE_1067MM: '1067 mm', NARROW_610MM: '610 mm', STANDARD_1435MM: '1435 mm',
};

export const RAIL_ELECTRIFICATION_VALUES: RailElectrification[] = ['DC_3KV', 'AC_25KV', 'AC_50KV', 'DIESEL'];
export const RAIL_ELECTRIFICATION_LABEL: Record<RailElectrification, string> = {
  DC_3KV: '3 kV DC', AC_25KV: '25 kV AC', AC_50KV: '50 kV AC', DIESEL: 'Diesel',
};

export const RAIL_VEHICLE_PROFILE_VALUES: RailVehicleProfile[] = ['A', 'B', 'B_PLUS_1'];
export const RAIL_VEHICLE_PROFILE_LABEL: Record<RailVehicleProfile, string> = { A: 'A', B: 'B', B_PLUS_1: 'B+1' };
/**
 * [BRIEF, unverified] The order of the vehicle profiles. No supplied document defines
 * A / B / B+1, so the profile comparison is ADVISORY (a warning), never a rejection.
 */
export const RAIL_VEHICLE_PROFILE_ORDER: RailVehicleProfile[] = ['A', 'B', 'B_PLUS_1'];

/**
 * The maximum axle-load classes a corridor or yard may declare, in tonnes.
 *
 * [NS V4 Ch.2] All five values are stated by the Network Statement: 20 t is the general
 * limit on five of the six corridors; 26 t is North §2.8.1.6; 30 t is Ore §2.9.1.6;
 * 18.5 t is North §2.8.1.6 (Empangeni–Nkwalini) and North-East §2.10.1.6 (branch lines);
 * 16.5 t is the lower bound of Cape §2.11.1.6 ("between 16.5 and 20").
 */
export const RAIL_AXLE_LOAD_CLASSES_T: readonly number[] = [16.5, 18.5, 20, 26, 30];

/**
 * A corridor-level envelope value is the GENERAL limit. Network Statement Chapter 2
 * states a general figure and then departs from it on named sections — North runs 20 t
 * but 26 t on the Blackhill–Ogies–Ermelo–Richards Bay and Trichardt–Ermelo stretches and
 * 18.5 t Empangeni–Nkwalini, and Cape is "predominantly" 1 065 mm but 610 mm on the
 * Avontuur / Patensie branches.
 *
 * Those departures are safety numbers, so they cannot be flattened into the general
 * column and they cannot live only in prose. Each one is recorded here, typed, and
 * validated: a corridor is not allowed to declare a limit the document never states.
 */
export type CorridorEnvelopeExceptionKind = 'AXLE_LOAD' | 'GAUGE' | 'TRAIN_LENGTH';

export interface CorridorEnvelopeException {
  kind: CorridorEnvelopeExceptionKind;
  /**
   * The sections this applies to, as the source words them. Where the document names the
   * sections we quote them; where it defers to an annexure we say so, rather than guessing.
   */
  sections: string;
  /** AXLE_LOAD only — tonnes per axle. */
  tonnes?: number;
  /** GAUGE only. */
  gauge?: RailGauge;
  /** TRAIN_LENGTH only — metres. */
  metres?: number;
  /** Why this differs from the corridor-level value. */
  note?: string;
}

const ENVELOPE_EXCEPTION_KINDS: readonly CorridorEnvelopeExceptionKind[] = ['AXLE_LOAD', 'GAUGE', 'TRAIN_LENGTH'];
const ENVELOPE_EXCEPTION_KEYS = new Set(['kind', 'sections', 'tonnes', 'gauge', 'metres', 'note']);

/** Returns a list of problems with one corridor-envelope exception; empty means it is well-formed. */
export function validateEnvelopeException(e: CorridorEnvelopeException, at: string): string[] {
  const p: string[] = [];
  if (!ENVELOPE_EXCEPTION_KINDS.includes(e?.kind)) {
    p.push(`${at}.kind "${String(e?.kind)}" is not one of ${ENVELOPE_EXCEPTION_KINDS.join('/')}`);
    return p; // nothing else is meaningful if the kind is unknown
  }
  for (const k of Object.keys(e ?? {})) {
    if (!ENVELOPE_EXCEPTION_KEYS.has(k)) p.push(`${at} has key "${k}" — only kind/sections/tonnes/gauge/metres/note are allowed`);
  }
  if (!String(e.sections ?? '').trim()) p.push(`${at}.sections is required`);

  if (e.kind === 'AXLE_LOAD') {
    if (typeof e.tonnes !== 'number') p.push(`${at} (AXLE_LOAD) requires tonnes`);
    else if (!RAIL_AXLE_LOAD_CLASSES_T.includes(e.tonnes)) {
      p.push(`${at} tonnes ${e.tonnes} is not one of ${RAIL_AXLE_LOAD_CLASSES_T.join('/')} t`);
    }
    if (e.gauge !== undefined) p.push(`${at} (AXLE_LOAD) must not set gauge`);
  }
  if (e.kind === 'GAUGE') {
    if (e.gauge === undefined) p.push(`${at} (GAUGE) requires gauge`);
    else if (!RAIL_GAUGE_VALUES.includes(e.gauge)) p.push(`${at} gauge "${e.gauge}" is not one of ${RAIL_GAUGE_VALUES.join('/')}`);
    if (e.tonnes !== undefined) p.push(`${at} (GAUGE) must not set tonnes`);
  }
  if (e.kind === 'TRAIN_LENGTH') {
    if (typeof e.metres !== 'number' || !Number.isInteger(e.metres) || e.metres <= 0) {
      p.push(`${at} (TRAIN_LENGTH) requires a positive integer metres`);
    }
  }
  return p;
}

/** [BRIEF, unverified — V4 section not supplied] A slot is allocated for at most this many years. */
export const MAX_SLOT_VALIDITY_YEARS = 5;
/** [BRIEF, unverified] An allocated slot must be mobilised within this many days of allocation. */
export const MOBILISATION_DAYS = 60;
/** [unverified UI/alert thresholds — not in any source] */
export const MOBILISATION_DUE_SOON_DAYS = 14;
export const COMPLIANCE_EXPIRY_WARNING_DAYS = 30;
export const COMPLIANCE_EXPIRY_CRITICAL_DAYS = 7;

export const RAIL_COMPLIANCE_DOC_TYPES: RailComplianceDocType[] = [
  'RSR_PERMIT', 'INSURANCE', 'ROLLING_STOCK_CERT', 'TRAIN_CREW_CERT',
  'DANGEROUS_GOODS', 'INTERFACE_AGREEMENT', 'ACCESS_CONTRACT', 'SECURITY_DEPOSIT',
];
export const RAIL_COMPLIANCE_DOC_LABEL: Record<RailComplianceDocType, string> = {
  RSR_PERMIT: 'RSR Safety Permit',
  INSURANCE: 'Insurance',
  ROLLING_STOCK_CERT: 'Rolling-stock certification',
  TRAIN_CREW_CERT: 'Train-crew certification',
  DANGEROUS_GOODS: 'Dangerous-goods authorisation',
  INTERFACE_AGREEMENT: 'Interface agreement',
  ACCESS_CONTRACT: 'Access contract (RAA)',
  SECURITY_DEPOSIT: 'Security deposit / guarantee',
};

// ── Contact directory ────────────────────────────────────────────────────────

/**
 * The contact directory holds ROLES and FUNCTION MAILBOXES only. Named people appear in
 * the supplied annexures and are withheld (POPIA; register EXC-022), so a personal-name
 * key is rejected.
 */
export interface ContactEntry {
  role: string;
  function?: string;
  email?: string;
  phone?: string;
  notes?: string;
}
const CONTACT_KEYS = new Set(['role', 'function', 'email', 'phone', 'notes']);

// ── Catalog entry validation (used by the seeder and by tests) ──────────────

export interface ReferenceEnvelopeFields {
  code: string;
  name: string;
  gauge: RailGauge | null;
  electrification: string[];
  maxAxleLoadTonnes: number | null;
  vehicleProfile: RailVehicleProfile | null;
  maxTrainLengthM: number | null;
  sidingCapacityWagons?: number | null;
  contacts: ContactEntry[];
  /**
   * SOURCE_PENDING = nothing loaded yet. PARTIAL = some envelope fields are loaded from a
   * cited source and others are still missing. VERIFIED = the whole envelope is loaded,
   * cited and reviewed.
   */
  dataStatus: 'SOURCE_PENDING' | 'PARTIAL' | 'VERIFIED';
  /**
   * Departures from the general envelope on named sections. See
   * {@link CorridorEnvelopeException} — these are safety numbers, so they are typed and
   * validated rather than left as prose.
   */
  envelopeExceptions?: CorridorEnvelopeException[] | null;
  sourceRef?: string | null;
  verifiedBy?: string | null;
}

/** Returns a list of problems; empty means the entry may be seeded. */
export function validateReferenceEntry(e: ReferenceEnvelopeFields): string[] {
  const p: string[] = [];
  if (!/^[A-Z0-9]+(-[A-Z0-9]+)*$/.test(e.code)) p.push(`code "${e.code}" must be UPPER-KEBAB`);
  if (!e.name?.trim()) p.push('name is required');
  if (e.gauge !== null && !RAIL_GAUGE_VALUES.includes(e.gauge)) p.push(`gauge "${e.gauge}" is not one of ${RAIL_GAUGE_VALUES.join('/')}`);
  for (const t of e.electrification) {
    if (!RAIL_ELECTRIFICATION_VALUES.includes(t as RailElectrification)) p.push(`electrification "${t}" is not one of ${RAIL_ELECTRIFICATION_VALUES.join('/')}`);
  }
  if (e.maxAxleLoadTonnes !== null && !RAIL_AXLE_LOAD_CLASSES_T.includes(e.maxAxleLoadTonnes)) {
    p.push(`maxAxleLoadTonnes ${e.maxAxleLoadTonnes} is not one of ${RAIL_AXLE_LOAD_CLASSES_T.join('/')} t`);
  }
  if (e.vehicleProfile !== null && !RAIL_VEHICLE_PROFILE_VALUES.includes(e.vehicleProfile)) p.push(`vehicleProfile "${e.vehicleProfile}" is not one of A/B/B+1`);
  for (const [k, v] of [['maxTrainLengthM', e.maxTrainLengthM], ['sidingCapacityWagons', e.sidingCapacityWagons ?? null]] as const) {
    if (v !== null && (!Number.isInteger(v) || v <= 0)) p.push(`${k} must be a positive integer`);
  }
  (e.envelopeExceptions ?? []).forEach((x, i) => p.push(...validateEnvelopeException(x, `envelopeExceptions[${i}]`)));
  e.contacts.forEach((c, i) => {
    for (const k of Object.keys(c)) if (!CONTACT_KEYS.has(k)) p.push(`contacts[${i}] has key "${k}" — only role/function/email/phone/notes are allowed (no personal names)`);
    if (!c.role?.trim()) p.push(`contacts[${i}].role is required`);
  });
  if (e.dataStatus === 'VERIFIED') {
    // VERIFIED means "loaded from a cited source and reviewed" — so it must actually be complete and cited.
    if (e.gauge === null) p.push('VERIFIED requires gauge');
    if (e.electrification.length === 0) p.push('VERIFIED requires electrification');
    if (e.maxAxleLoadTonnes === null) p.push('VERIFIED requires maxAxleLoadTonnes');
    if (e.vehicleProfile === null) p.push('VERIFIED requires vehicleProfile');
    if (e.maxTrainLengthM === null) p.push('VERIFIED requires maxTrainLengthM');
    if (!e.sourceRef?.trim()) p.push('VERIFIED requires sourceRef');
    if (!e.verifiedBy?.trim()) p.push('VERIFIED requires verifiedBy');
  }
  if (e.dataStatus === 'PARTIAL') {
    // PARTIAL claims "some of this is real" — so something must actually be loaded, and it
    // must say where it came from. Otherwise it is just SOURCE_PENDING wearing a better name.
    const loaded = [
      e.gauge !== null,
      e.electrification.length > 0,
      e.maxAxleLoadTonnes !== null,
      e.maxTrainLengthM !== null,
      (e.envelopeExceptions ?? []).length > 0,
    ].some(Boolean);
    if (!loaded) p.push('PARTIAL requires at least one loaded envelope value');
    if (!e.sourceRef?.trim()) p.push('PARTIAL requires sourceRef');
  }
  return p;
}

// ── Corridor resolution ──────────────────────────────────────────────────────

export interface CorridorIdentity {
  code: string;
  name: string;
  aliases?: string[] | null;
  workbookRoutes?: string[] | null;
}

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Map a free-text corridor (RailConsignment.corridor is a plain String) to a catalog corridor.
 * Matches code, V4 name, pre-V4 alias or an Annexure 33b route name, exactly after
 * normalisation. No fuzzy matching: a wrong match would apply the wrong envelope.
 */
export function resolveCorridor<T extends CorridorIdentity>(corridors: readonly T[], text: string | null | undefined): T | undefined {
  if (!text?.trim()) return undefined;
  const k = key(text);
  return corridors.find((c) => [c.code, c.name, ...(c.aliases ?? []), ...(c.workbookRoutes ?? [])].some((x) => key(x) === k));
}
