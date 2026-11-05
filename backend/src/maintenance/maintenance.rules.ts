import type {
  AssetClass,
  AssetStatus,
  MaintenanceCostKind,
  MaintenanceJobStatus,
  MaintenanceJobType,
} from '@prisma/client';

/**
 * The rules of a job card, as pure functions.
 *
 * Everything expensive about maintenance reporting comes from four numbers, and
 * each one is computed here rather than typed into a field:
 *
 *  1. **Downtime** — from the timestamps on the card. A typed-in figure is an
 *     opinion, and the person who benefits from a flattering figure is often
 *     the one typing it.
 *  2. **Availability** — from downtime against a stated period. Always carries
 *     its basis, and returns `null` rather than 100% when there is no basis.
 *  3. **Warranty position** — a job's warranty is IN, OUT or **UNKNOWN**. A job
 *     with no term recorded is not "out of warranty"; treating it as such is
 *     how a business ends up re-doing its own work for free and calling it
 *     goodwill. A unit's *supplier* warranty adds a fourth answer, because a
 *     term can stay live and stop standing — see `assetWarrantyStanding`.
 *  4. **Comeback** — a job that repeats an earlier fault on the same unit. It is
 *     a link between two records, detected from data, so a repeat failure is
 *     visible even when the person who caused it is the person writing the card.
 *
 * Nothing in this file reads a clock, a database or a request. That is what
 * makes the rules testable and what stops a reporting bug from hiding inside an
 * HTTP handler.
 */

// ── The lifecycle ───────────────────────────────────────────────────────────

/**
 * Legal moves for a job card.
 *
 *                        ┌────────────► CANCELLED (terminal, reason required)
 *   REPORTED ──► IN_PROGRESS ──► COMPLETED ──► SIGNED_OFF (terminal)
 *      │              │              │
 *      └──────────────┴──────────────┴──────► CANCELLED
 *
 * `COMPLETED` can still be cancelled: a card raised against the wrong unit, or
 * work recorded that did not happen, has to be correctable — but only by a
 * status change that leaves the card and its reason in place. `SIGNED_OFF` is
 * terminal because the custodian has accepted the work; un-accepting a
 * signature is not an edit, it is a dispute, and disputes belong in a new card.
 */
export const JOB_TRANSITIONS: Record<MaintenanceJobStatus, MaintenanceJobStatus[]> = {
  REPORTED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['SIGNED_OFF', 'CANCELLED'],
  SIGNED_OFF: [],
  CANCELLED: [],
};

export const TERMINAL_JOB_STATUSES: MaintenanceJobStatus[] = ['SIGNED_OFF', 'CANCELLED'];

/** Statuses whose work actually happened, and therefore carry cost and warranty. */
export const WORKED_JOB_STATUSES: MaintenanceJobStatus[] = ['COMPLETED', 'SIGNED_OFF'];

/** Statuses that mean the unit is not available — used for the DOWN finding. */
export const UNAVAILABLE_ASSET_STATUSES: AssetStatus[] = ['DOWN', 'UNDER_REPAIR'];

export function canTransition(from: MaintenanceJobStatus, to: MaintenanceJobStatus): boolean {
  return JOB_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalJob(status: MaintenanceJobStatus): boolean {
  return TERMINAL_JOB_STATUSES.includes(status);
}

/** Why a status change was refused, in words the person clicking can act on. */
export function transitionRefusal(from: MaintenanceJobStatus, to: MaintenanceJobStatus): string {
  if (from === to) {
    return `This job is already ${humanStatus(from)}.`;
  }
  if (isTerminalJob(from)) {
    return from === 'SIGNED_OFF'
      ? 'This job has been signed off by the custodian. If the work has failed, raise a new job and link it to this one — that is what makes it a comeback rather than a correction.'
      : 'This job was cancelled. Raise a new card instead of reopening one that was withdrawn.';
  }
  return `A job that is ${humanStatus(from)} cannot become ${humanStatus(to)}.`;
}

export function humanStatus(status: MaintenanceJobStatus): string {
  return status.toLowerCase().replace(/_/g, ' ');
}

/** Next job number. Derives from the highest existing, so it never collides with a gap. */
export function nextJobNumber(lastNumber: string | null | undefined, year: number): string {
  const prefix = `MJ-${year}-`;
  let sequence = 1;
  if (lastNumber && lastNumber.startsWith(prefix)) {
    const parsed = Number.parseInt(lastNumber.slice(prefix.length), 10);
    if (Number.isFinite(parsed)) sequence = parsed + 1;
  }
  return `${prefix}${String(sequence).padStart(4, '0')}`;
}

// ── Warranty ────────────────────────────────────────────────────────────────

/**
 * The longest term this record will hold: ten years.
 *
 * Not a policy preference — a boundary. Beyond it the number stops behaving
 * like a warranty and starts behaving like the word "lifetime", which the
 * business cannot price, reserve against, or prove. A term that long is
 * recorded as what it is (a commercial promise) somewhere that can be
 * negotiated, not in a field that a report will later multiply by a parts bill.
 */
export const MAX_WARRANTY_TERM_DAYS = 3650;

export interface TermCheck {
  ok: boolean;
  /** The accepted term, or null when no term was supplied (a legitimate state). */
  days: number | null;
  /** Present when ok is false. */
  reason?: string;
}

/**
 * Validate a warranty term.
 *
 * `null` is a valid answer: plenty of jobs carry no warranty, and "not
 * recorded" is a fact. `"lifetime"` is not a valid answer, and the refusal
 * explains why rather than just failing validation — the person typing it
 * believes they are being generous, and deserves to know what the record will
 * do with that generosity.
 */
export function checkWarrantyTerm(input: unknown): TermCheck {
  if (input === null || input === undefined || input === '') {
    return { ok: true, days: null };
  }

  if (typeof input === 'string') {
    const word = input.trim().toLowerCase();
    if (['lifetime', 'life', 'forever', 'unlimited', 'permanent'].includes(word)) {
      return {
        ok: false,
        days: null,
        reason:
          'A lifetime warranty cannot be recorded, because nothing downstream can price, reserve or prove it. Record the term you can stand behind in days — and keep the longer promise where it belongs, in the agreement.',
      };
    }
    if (!/^\d+$/.test(word)) {
      return { ok: false, days: null, reason: 'A warranty term is a whole number of days.' };
    }
    return checkWarrantyTerm(Number.parseInt(word, 10));
  }

  if (typeof input !== 'number' || !Number.isFinite(input)) {
    return { ok: false, days: null, reason: 'A warranty term is a whole number of days.' };
  }
  if (!Number.isInteger(input)) {
    return { ok: false, days: null, reason: 'A warranty term is a whole number of days.' };
  }
  if (input <= 0) {
    return {
      ok: false,
      days: null,
      reason: 'A term of zero days is no warranty at all. Leave the field blank instead.',
    };
  }
  if (input > MAX_WARRANTY_TERM_DAYS) {
    return {
      ok: false,
      days: null,
      reason: `The longest term this record will hold is ${MAX_WARRANTY_TERM_DAYS} days. Anything longer is a promise the business cannot price — record it in the agreement, not here.`,
    };
  }
  return { ok: true, days: input };
}

/**
 * When the warranty on a job expires.
 *
 * The clock starts when the work was completed, not when the form was signed.
 * A warranty that never begins because nobody signed anything is worse than one
 * that begins a day or two early — the first is a silent hole in the record,
 * the second is a rounding error.
 */
export function warrantyExpiry(
  completedAt: Date | string | null | undefined,
  termDays: number | null | undefined,
): Date | null {
  if (!completedAt || termDays === null || termDays === undefined) return null;
  const start = completedAt instanceof Date ? completedAt : new Date(completedAt);
  if (Number.isNaN(start.getTime())) return null;
  if (!Number.isFinite(termDays) || termDays <= 0) return null;
  return new Date(start.getTime() + termDays * 24 * 60 * 60 * 1000);
}

/**
 * Three-valued, deliberately.
 *
 * `UNKNOWN` is not a placeholder to be resolved later — it is the truthful
 * answer for a job whose term was never recorded. Collapsing it into
 * `OUT_OF_WARRANTY` would let the system quietly tell an operator that their
 * own rework is chargeable, which is exactly the judgement a database should
 * not make.
 */
export type WarrantyPosition =
  | 'IN_WARRANTY'
  | 'SERVICE_OVERDUE'
  | 'OUT_OF_WARRANTY'
  | 'UNKNOWN';

export interface WarrantyBearingJob {
  status: MaintenanceJobStatus;
  completedAt?: Date | string | null;
  warrantyExpiresAt?: Date | string | null;
  warrantyTermDays?: number | null;
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function warrantyPosition(job: WarrantyBearingJob, at: Date = new Date()): WarrantyPosition {
  // Cancelled work carries no warranty, and a card that was never completed has
  // no window to be inside of.
  if (job.status === 'CANCELLED') return 'UNKNOWN';
  const completedAt = asDate(job.completedAt);
  if (!completedAt) return 'UNKNOWN';

  const expiresAt = asDate(job.warrantyExpiresAt) ?? warrantyExpiry(completedAt, job.warrantyTermDays ?? null);
  // No term, no expiry: nobody wrote down what was promised, so the record does
  // not get to claim the promise has lapsed.
  if (!expiresAt) return 'UNKNOWN';

  return at.getTime() <= expiresAt.getTime() ? 'IN_WARRANTY' : 'OUT_OF_WARRANTY';
}

export function warrantyLabel(position: WarrantyPosition): string {
  switch (position) {
    case 'IN_WARRANTY':
      return 'In warranty';
    case 'SERVICE_OVERDUE':
      return 'Service overdue — cover unproven';
    case 'OUT_OF_WARRANTY':
      return 'Out of warranty';
    default:
      return 'Warranty not recorded';
  }
}

// ── The warranty on the machine ─────────────────────────────────────────────

/**
 * A term is not the same thing as a clock, and treating it as one is how a
 * contractor discovers on the day of a claim that the cover lapsed a year ago.
 *
 * A terminal operator described his fleet: 30 months on the fuel tanks,
 * extending to the engine, the injection sets and the injection pumps — and
 * kept alive by **one labour-only service a year, one to three hours**. That is
 * the ordinary shape of an OEM warranty: the term is the promise, and a
 * condition is what keeps the promise standing. Miss the service and the
 * supplier is entitled to refuse the claim, without the term ever expiring.
 *
 * A record that only counts days would say IN_WARRANTY on a machine that has
 * not been touched in three years. It would be wrong on the day it mattered
 * most.
 */
export const WARRANTY_SERVICE_GRACE_DAYS = 30;

/**
 * Work that keeps a warranty standing.
 *
 * The condition is attendance at a service, so what counts is the planned
 * service and the inspection — not a breakdown (the machine failing is not the
 * operator maintaining it) and not a recall (the supplier's action, not the
 * operator's compliance).
 *
 * It happens to equal the planned-work set today, and it is named separately
 * anyway: these two ideas can part company — a breakdown visit that also
 * carries out the service would keep the warranty alive without becoming
 * planned availability.
 */
export function keepsWarrantyAlive(type: MaintenanceJobType): boolean {
  return isPlannedWork(type);
}

export interface AssetWarrantyTerms {
  /** When the supplier's term began — delivery or commissioning. */
  warrantyStartAt?: Date | string | null;
  /** The term in days. Absent means nobody wrote it down; it is not "none". */
  warrantyTermDays?: number | null;
  /** How often the term must be serviced to stay alive, in days. */
  warrantyServiceIntervalDays?: number | null;
  /** Completion of the most recent service-type job on this unit, if any. */
  lastServiceAt?: Date | string | null;
}

export interface WarrantyStanding {
  state: WarrantyPosition;
  /** End of the term. Null when there is no term to end. */
  expiresAt: Date | null;
  /** The date the supplier expects the service to be on record. */
  serviceDueAt: Date | null;
  /** Past this, the condition has been missed — the date a claim starts to fail. */
  serviceGraceEndsAt: Date | null;
  /** Whole days the service is late, past the grace. 0 when it is not late. */
  daysOverdue: number;
  /** Days since the last recorded service; null when there has never been one. */
  daysSinceService: number | null;
  /** True when a term exists but no service has ever been recorded against it. */
  neverServiced: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

function wholeDaysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * Where a unit stands against the supplier's warranty, condition included.
 *
 * The four answers, in the order they are decided:
 *
 *  1. **UNKNOWN** — no start date or no term on the record. Not "out of
 *     warranty": an unwritten promise is not an expired one, and the cost of
 *     guessing wrong is a rework the operator redoes for free.
 *  2. **OUT_OF_WARRANTY** — the term has run out. Nothing the operator does now
 *     brings it back.
 *  3. **SERVICE_OVERDUE** — the term is live, but the service that keeps it
 *     live is not on record. Deliberately *not* called "void": whether a claim
 *     is honoured is the supplier's decision, and this record does not get to
 *     make it. What it can say is that the evidence is missing, which is the
 *     thing the operator can still fix.
 *  4. **IN_WARRANTY** — live term, condition satisfied.
 */
export function assetWarrantyStanding(terms: AssetWarrantyTerms, at: Date = new Date()): WarrantyStanding {
  const none: WarrantyStanding = {
    state: 'UNKNOWN',
    expiresAt: null,
    serviceDueAt: null,
    serviceGraceEndsAt: null,
    daysOverdue: 0,
    daysSinceService: null,
    neverServiced: false,
  };

  const start = asDate(terms.warrantyStartAt);
  const term = terms.warrantyTermDays;
  if (!start || term === null || term === undefined || !Number.isFinite(term) || term <= 0) {
    return none;
  }

  const expiresAt = addDays(start, term);
  const lastService = asDate(terms.lastServiceAt);
  const interval = terms.warrantyServiceIntervalDays;
  const hasCondition = typeof interval === 'number' && Number.isFinite(interval) && interval > 0;

  let serviceDueAt: Date | null = null;
  let serviceGraceEndsAt: Date | null = null;
  let daysOverdue = 0;

  if (hasCondition) {
    // The clock starts at the later of delivery and the last service: a service
    // carried out before delivery does not buy an extra year.
    const anchor = lastService && lastService.getTime() > start.getTime() ? lastService : start;
    serviceDueAt = addDays(anchor, interval as number);
    serviceGraceEndsAt = addDays(serviceDueAt, WARRANTY_SERVICE_GRACE_DAYS);
    if (at.getTime() > serviceGraceEndsAt.getTime()) {
      daysOverdue = wholeDaysBetween(serviceGraceEndsAt, at);
    }
  }

  const daysSinceService = lastService ? Math.max(0, wholeDaysBetween(lastService, at)) : null;

  let state: WarrantyPosition;
  if (at.getTime() > expiresAt.getTime()) {
    state = 'OUT_OF_WARRANTY';
  } else if (serviceGraceEndsAt && at.getTime() > serviceGraceEndsAt.getTime()) {
    state = 'SERVICE_OVERDUE';
  } else {
    state = 'IN_WARRANTY';
  }

  return {
    state,
    expiresAt,
    serviceDueAt,
    serviceGraceEndsAt,
    daysOverdue,
    daysSinceService,
    neverServiced: hasCondition && lastService === null && at.getTime() > start.getTime(),
  };
}

// ── Downtime & availability ─────────────────────────────────────────────────

/** Planned work and inspections take the unit out of service on purpose. */
export function isPlannedWork(type: MaintenanceJobType): boolean {
  return type === 'PLANNED' || type === 'INSPECTION';
}

/**
 * Minutes the unit stood still because of this job.
 *
 * Null is a real answer and it means two different things on purpose:
 *  - planned work or an inspection → the unit was *scheduled* out, which is not
 *    lost availability and must never be counted as such;
 *  - a cancelled card → nothing happened.
 *
 * An open breakdown counts to `now`: a unit that has been down for six days is
 * six days of lost availability whether or not anyone has closed the card.
 */
export function downtimeMinutes(
  job: {
    type: MaintenanceJobType;
    status: MaintenanceJobStatus;
    reportedAt: Date | string;
    completedAt?: Date | string | null;
  },
  now: Date = new Date(),
): number | null {
  if (job.status === 'CANCELLED') return null;
  if (isPlannedWork(job.type)) return null;

  const reportedAt = asDate(job.reportedAt);
  if (!reportedAt) return null;
  const end = asDate(job.completedAt) ?? now;
  const minutes = Math.floor((end.getTime() - reportedAt.getTime()) / 60000);
  // Clock skew and back-dated corrections exist; a negative downtime is noise,
  // not a credit.
  return minutes > 0 ? minutes : 0;
}

/** Minutes of [start, end] that fall inside the window. */
export function overlapMinutes(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
  windowStart: Date,
  windowEnd: Date,
): number {
  const from = asDate(start);
  const to = asDate(end);
  if (!from || !to) return 0;
  const a = Math.max(from.getTime(), windowStart.getTime());
  const b = Math.min(to.getTime(), windowEnd.getTime());
  return b > a ? Math.floor((b - a) / 60000) : 0;
}

export interface Availability {
  /** Null when the basis is empty — never 100% from no data. */
  percent: number | null;
  basisMinutes: number;
  downtimeMinutes: number;
}

/**
 * Availability, always carrying its basis.
 *
 * `percent` is rounded to one decimal: reporting 99.94% implies a precision a
 * timestamped log book does not have.
 */
export function availability(downtime: number, basisMinutes: number): Availability {
  const basis = Number.isFinite(basisMinutes) ? Math.max(0, Math.floor(basisMinutes)) : 0;
  const down = Number.isFinite(downtime) ? Math.max(0, Math.floor(downtime)) : 0;
  if (basis <= 0) {
    return { percent: null, basisMinutes: 0, downtimeMinutes: down };
  }
  const bounded = Math.min(down, basis);
  return {
    percent: Math.round(((basis - bounded) / basis) * 1000) / 10,
    basisMinutes: basis,
    downtimeMinutes: bounded,
  };
}

/** Hours as a one-decimal number — what a supervisor actually reads. */
export function toHours(minutes: number | null | undefined): number | null {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return null;
  return Math.round((minutes / 60) * 10) / 10;
}

// ── Comebacks ───────────────────────────────────────────────────────────────

export interface LineageJob {
  id: string;
  assetId: string;
  faultCodeId?: string | null;
  status: MaintenanceJobStatus;
  reportedAt: Date | string;
  completedAt?: Date | string | null;
  warrantyExpiresAt?: Date | string | null;
  warrantyTermDays?: number | null;
}

/**
 * The earlier job this one repeats, if any.
 *
 * A repeat is the same fault on the same unit. Finding it from the data matters
 * more than it looks: the person best placed to notice a comeback is the person
 * whose work it was, and asking them to volunteer it is asking a lot. The link
 * is mechanical.
 *
 * Fault codes are required for a match. Free text does not group, and a
 * "similar sounding" match would invent comebacks that never happened — which
 * is worse than missing one.
 */
export function findComeback<J extends LineageJob>(current: LineageJob, priorJobs: J[]): J | null {
  if (!current.faultCodeId) return null;
  const reportedAt = asDate(current.reportedAt);
  if (!reportedAt) return null;

  const candidates = priorJobs
    .filter((job) => job.id !== current.id)
    .filter((job) => job.assetId === current.assetId)
    .filter((job) => job.faultCodeId === current.faultCodeId)
    .filter((job) => WORKED_JOB_STATUSES.includes(job.status))
    .filter((job) => {
      const completed = asDate(job.completedAt);
      return completed !== null && completed.getTime() <= reportedAt.getTime();
    })
    .sort((a, b) => {
      const at = asDate(a.completedAt)?.getTime() ?? 0;
      const bt = asDate(b.completedAt)?.getTime() ?? 0;
      return bt - at;
    });

  return candidates[0] ?? null;
}

/**
 * Whether a repeat falls inside the warranty the earlier job carried.
 *
 * Separate from `findComeback` on purpose: the *fact* of a recurrence is worth
 * recording even when it is out of warranty — that is how a bad component or a
 * bad diagnosis shows itself. The *cost consequence* only exists inside the
 * window.
 */
export function isWarrantyComeback(priorJob: WarrantyBearingJob & LineageJob, repeatedAt: Date): boolean {
  return warrantyPosition(priorJob, repeatedAt) === 'IN_WARRANTY';
}

// ── Money ───────────────────────────────────────────────────────────────────

export const COST_KINDS: MaintenanceCostKind[] = [
  'PART',
  'LABOUR',
  'OUTSIDE_SERVICE',
  'TRAVEL',
  'CONSUMABLE',
];

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Quantity × unit cost, to cents. Negative inputs are refused before this runs. */
export function costAmount(quantity: number, unitCost: number): number {
  if (!Number.isFinite(quantity) || !Number.isFinite(unitCost)) return 0;
  return roundMoney(quantity * unitCost);
}

export interface CostRow {
  kind: MaintenanceCostKind;
  amount: number;
}

export interface CostSummary {
  total: number;
  byKind: Partial<Record<MaintenanceCostKind, number>>;
  /** How many rows carry a non-zero amount — a total from no rows reads as "free". */
  rows: number;
}

export function summariseCosts(rows: CostRow[]): CostSummary {
  const byKind: Partial<Record<MaintenanceCostKind, number>> = {};
  let total = 0;
  for (const row of rows) {
    const amount = Number.isFinite(row.amount) ? row.amount : 0;
    total += amount;
    byKind[row.kind] = roundMoney((byKind[row.kind] ?? 0) + amount);
  }
  return { total: roundMoney(total), byKind, rows: rows.length };
}

/**
 * Cost per operating unit (per hour, per kilometre) between two meter readings.
 *
 * Null when the meter has not advanced. A meter that has not moved since the
 * last reading is either a unit standing still or a reading that was never
 * taken — and dividing by it produces infinity, which then renders as a
 * headline.
 */
export function costPerOperatingUnit(
  cost: number,
  meterStart: number | null | undefined,
  meterEnd: number | null | undefined,
): number | null {
  if (meterStart === null || meterStart === undefined) return null;
  if (meterEnd === null || meterEnd === undefined) return null;
  const delta = meterEnd - meterStart;
  if (!Number.isFinite(delta) || delta <= 0) return null;
  if (!Number.isFinite(cost)) return null;
  return roundMoney(cost / delta);
}

// ── Meter integrity ─────────────────────────────────────────────────────────

export interface MeterCheck {
  ok: boolean;
  reason?: string;
}

/**
 * A meter reading may not go backwards.
 *
 * Two things look identical in the data and are completely different in the
 * business: a replaced instrument, and a reading typed to make a number look
 * better. Neither is allowed to overwrite history — the reading is refused and
 * the operator has to say what happened, which leaves a trail.
 */
export function checkMeterReading(reading: unknown, lastReading: number | null | undefined): MeterCheck {
  if (typeof reading !== 'number' || !Number.isFinite(reading)) {
    return { ok: false, reason: 'A meter reading must be a number.' };
  }
  if (reading < 0) {
    return { ok: false, reason: 'A meter reading cannot be negative.' };
  }
  if (typeof lastReading === 'number' && Number.isFinite(lastReading) && reading < lastReading) {
    return {
      ok: false,
      reason: `This reading (${reading}) is lower than the last accepted one (${lastReading}). If the instrument was replaced, record the new meter's zero point on the unit's notes before its first reading — a meter that runs backwards makes every cost-per-hour figure on this unit meaningless.`,
    };
  }
  return { ok: true };
}

// ── The fault pattern ───────────────────────────────────────────────────────

export interface FaultPatternRow {
  faultCodeId: string;
  occurrences: number;
  lastReportedAt: Date;
  totalDowntimeMinutes: number;
  comebacks: number;
}

/**
 * Group a unit's history by fault code.
 *
 * This is the page a contractor photographs and sends to the contract holder:
 * not "I did 40 jobs", but "this fault came back four times and cost 31 hours
 * of availability". One job card proves one job; a pattern funds a decision.
 */
export function faultPattern(
  jobs: Array<
    LineageJob & {
      faultCodeId: string;
      downtimeMinutes?: number | null;
      priorJobId?: string | null;
    }
  >,
): FaultPatternRow[] {
  const byCode = new Map<string, FaultPatternRow>();
  for (const job of jobs) {
    if (!job.faultCodeId) continue;
    if (job.status === 'CANCELLED') continue;
    const reportedAt = asDate(job.reportedAt);
    if (!reportedAt) continue;

    const row = byCode.get(job.faultCodeId) ?? {
      faultCodeId: job.faultCodeId,
      occurrences: 0,
      lastReportedAt: reportedAt,
      totalDowntimeMinutes: 0,
      comebacks: 0,
    };
    row.occurrences += 1;
    row.totalDowntimeMinutes += job.downtimeMinutes && job.downtimeMinutes > 0 ? job.downtimeMinutes : 0;
    if (job.priorJobId) row.comebacks += 1;
    if (reportedAt.getTime() > row.lastReportedAt.getTime()) row.lastReportedAt = reportedAt;
    byCode.set(job.faultCodeId, row);
  }
  return [...byCode.values()].sort(
    (a, b) => b.occurrences - a.occurrences || b.totalDowntimeMinutes - a.totalDowntimeMinutes,
  );
}

// ── The verdict ─────────────────────────────────────────────────────────────

/**
 * Thresholds, in one place, so the fleet report cannot quietly change what it
 * means. The same discipline as the host-patching audit: a finding has an age
 * and a cost, not just a count.
 */
export const MAINTENANCE_THRESHOLDS = {
  /** Below this, the fleet's availability is worth a conversation. */
  availabilityWarnPercent: 95,
  /** Share of completed work that is a repeat of earlier work. */
  comebackWarnPercent: 15,
  /** A breakdown nobody has touched for this long is not "in progress". */
  stalledJobHours: 48,
  /**
   * How far past a class's expected repair time a unit has to run before it
   * stops being a repair and becomes a contract exposure.
   *
   * A fixed number of hours cannot express this. When the first terminal
   * operator gave us their timings — five days for an RTG, three for a
   * straddle carrier — the previous flat threshold of 72 hours turned every
   * single RTG repair into an alarm for its last two days, and every straddle
   * repair into one the moment it was finished. An alarm that fires on correct
   * work is worse than no alarm: it trains the operator to ignore the panel.
   */
  longDownMultiple: 1.5,
} as const;

/**
 * How long a repair is *expected* to take, in hours, by class.
 *
 * Only two entries, and that is deliberate: these are the timings a terminal
 * operator gave from their own job cards. Every other class falls to the
 * default rather than to a number invented here — a guessed expectation is a
 * guessed alarm, and the whole point of this module is that figures carry
 * evidence.
 */
export const EXPECTED_REPAIR_HOURS: Partial<Record<AssetClass, number>> = {
  RTG: 120,
  STRADDLE_CARRIER: 72,
};

/**
 * The fallback: 48 hours, which reproduces the old 72-hour flag exactly
 * (48 × 1.5). Classes nobody has measured keep the behaviour they had before.
 */
export const DEFAULT_EXPECTED_REPAIR_HOURS = 48;

export function expectedRepairHours(assetClass: AssetClass | null | undefined): number {
  if (assetClass && EXPECTED_REPAIR_HOURS[assetClass]) {
    return EXPECTED_REPAIR_HOURS[assetClass] as number;
  }
  return DEFAULT_EXPECTED_REPAIR_HOURS;
}

/** The point at which a unit has been down long enough to be a contract problem. */
export function longDownLimitHours(assetClass: AssetClass | null | undefined): number {
  return Math.round(expectedRepairHours(assetClass) * MAINTENANCE_THRESHOLDS.longDownMultiple);
}

const ASSET_CLASS_LABELS: Record<string, string> = {
  REACH_STACKER: 'Reach stacker',
  RTG: 'RTG',
  RMG: 'RMG',
  STRADDLE_CARRIER: 'Straddle carrier',
  FORKLIFT: 'Forklift',
  TRACTOR: 'Tractor',
  TRUCK: 'Truck',
  HAULER: 'Hauler',
  TRAILER: 'Trailer',
  GENSET: 'Genset',
  CRANE: 'Crane',
  PUMP: 'Pump',
  OTHER: 'Unit',
};

export function assetClassLabel(assetClass: AssetClass | null | undefined): string {
  return (assetClass && ASSET_CLASS_LABELS[assetClass]) || 'Unit';
}

export type FindingSeverity = 'attention' | 'info';

export interface MaintenanceFinding {
  code: string;
  severity: FindingSeverity;
  message: string;
}

export interface MaintenanceMetrics {
  assets: number;
  assetsDown: number;
  jobsOpen: number;
  jobsCompleted: number;
  availabilityPercent: number | null;
  downtimeHours: number;
  comebackSharePercent: number | null;
  warrantyExposure: number;
  /** Units inside a live supplier term, whatever their condition. */
  unitsInTerm: number;
  /** Units whose term is live but whose service condition has been missed. */
  unitsServiceOverdue: number;
}

/**
 * One class of plant, on its own.
 *
 * A fleet-wide availability figure is the number that gets reported; it is not
 * the number that gets acted on. At a terminal running 22 RTGs, 60 straddle
 * carriers and 40 haulers, "the fleet is at 94%" hides the fact that the
 * straddles are at 88% and everything else is fine — and it is the straddles
 * that will stop the quay. Grouping costs one pass over the same data, and it
 * is the difference between a dashboard and an answer.
 */
export interface ClassRollup {
  assetClass: AssetClass;
  label: string;
  units: number;
  byStatus: Partial<Record<AssetStatus, number>>;
  unitsDown: number;
  openJobs: number;
  jobsCompleted: number;
  downtimeHours: number;
  availabilityPercent: number | null;
  /** Longest current outage in this class, in hours. Null when nothing is down. */
  longestDownHours: number | null;
  /** What a repair in this class is expected to take, and when it is flagged. */
  expectedRepairHours: number;
  longDownLimitHours: number;
}

export interface MaintenanceVerdict {
  status: 'ok' | 'attention';
  headline: string;
  findings: MaintenanceFinding[];
  metrics: MaintenanceMetrics;
  /** Worst availability first. Empty when there is nothing on the register. */
  byClass: ClassRollup[];
}

export interface VerdictAsset {
  id: string;
  assetCode: string;
  name?: string | null;
  status: AssetStatus;
  /** Drives the expected repair time, and therefore the long-down limit. */
  assetClass?: AssetClass | null;
  /** The supplier's term, and the condition that keeps it standing. */
  warrantyStartAt?: Date | string | null;
  warrantyTermDays?: number | null;
  warrantyServiceIntervalDays?: number | null;
  /** Completion of the most recent service-type job, when one exists. */
  lastServiceAt?: Date | string | null;
}

export interface VerdictJob {
  id: string;
  assetId: string;
  type: MaintenanceJobType;
  status: MaintenanceJobStatus;
  reportedAt: Date | string;
  completedAt?: Date | string | null;
  startedAt?: Date | string | null;
  priorJobId?: string | null;
  priorJob?: WarrantyBearingJob | null;
  costs?: Array<{ amount: number }>;
}

export interface VerdictInput {
  assets: VerdictAsset[];
  jobs: VerdictJob[];
  /** Which period the numbers describe. Stated in the headline, never assumed. */
  windowDays: number;
  now: Date;
  currency?: string;
}

function money(amount: number, currency: string): string {
  const fixed = Math.abs(amount).toFixed(2);
  const [whole, cents] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${currency} ${amount < 0 ? '-' : ''}${grouped}.${cents}`;
}

/**
 * Group the fleet by class and answer the same four questions for each.
 *
 * Downtime is counted the same way the fleet figure counts it — breakdowns and
 * recalls, clipped to the window, planned work excluded — because a class card
 * that disagreed with the headline would be worse than no class card.
 */
export function rollUpByClass(
  assets: VerdictAsset[],
  jobs: VerdictJob[],
  windowDays: number,
  now: Date,
): ClassRollup[] {
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const groups = new Map<AssetClass, { assets: VerdictAsset[]; downtime: number }>();

  for (const asset of assets) {
    const key = (asset.assetClass ?? 'OTHER') as AssetClass;
    const group = groups.get(key) ?? { assets: [], downtime: 0 };
    group.assets.push(asset);
    groups.set(key, group);
  }

  const classOf = new Map(assets.map((asset) => [asset.id, (asset.assetClass ?? 'OTHER') as AssetClass]));

  for (const job of jobs) {
    if (isPlannedWork(job.type) || job.status === 'CANCELLED') continue;
    const start = asDate(job.reportedAt);
    if (!start) continue;
    const end = asDate(job.completedAt) ?? now;
    const key = classOf.get(job.assetId);
    if (!key) continue;
    const group = groups.get(key);
    if (!group) continue;
    group.downtime += overlapMinutes(start, end, windowStart, now);
  }

  const rows: ClassRollup[] = [];
  for (const [assetClass, group] of groups) {
    const byStatus: Partial<Record<AssetStatus, number>> = {};
    for (const asset of group.assets) byStatus[asset.status] = (byStatus[asset.status] ?? 0) + 1;

    const ids = new Set(group.assets.map((asset) => asset.id));
    const classJobs = jobs.filter((job) => ids.has(job.assetId));
    const open = classJobs.filter((job) => job.status === 'REPORTED' || job.status === 'IN_PROGRESS');
    const completed = classJobs.filter((job) => WORKED_JOB_STATUSES.includes(job.status));

    const downAssets = group.assets.filter((asset) => UNAVAILABLE_ASSET_STATUSES.includes(asset.status));
    let longestDownHours: number | null = null;
    for (const asset of downAssets) {
      const oldest = open
        .filter((job) => job.assetId === asset.id)
        .map((job) => asDate(job.reportedAt))
        .filter((date): date is Date => date !== null)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      if (!oldest) continue;
      const hours = Math.floor((now.getTime() - oldest.getTime()) / 3600000);
      if (longestDownHours === null || hours > longestDownHours) longestDownHours = hours;
    }

    const figure = availability(group.downtime, group.assets.length * windowDays * 24 * 60);

    rows.push({
      assetClass,
      label: assetClassLabel(assetClass),
      units: group.assets.length,
      byStatus,
      unitsDown: downAssets.length,
      openJobs: open.length,
      jobsCompleted: completed.length,
      downtimeHours: toHours(figure.downtimeMinutes) ?? 0,
      availabilityPercent: figure.percent,
      longestDownHours,
      expectedRepairHours: expectedRepairHours(assetClass),
      longDownLimitHours: longDownLimitHours(assetClass),
    });
  }

  // Worst availability first — the class that is costing the most attention —
  // then by size, so two classes at the same figure are read biggest first.
  return rows.sort(
    (a, b) =>
      (a.availabilityPercent ?? 101) - (b.availabilityPercent ?? 101) ||
      b.units - a.units ||
      a.label.localeCompare(b.label),
  );
}

/**
 * The one page.
 *
 * Answers, in order: can the fleet work (availability), is the work holding
 * (comebacks), is anything stuck (stalled cards, long-down units), and what is
 * this costing us that we cannot charge for (rework inside warranty).
 *
 * Every finding is a sentence with a number and a unit in it. A dashboard that
 * says "3" has not told anyone anything.
 */
export function maintenanceVerdict(input: VerdictInput): MaintenanceVerdict {
  const currency = input.currency ?? 'ZAR';
  const now = input.now;
  const windowStart = new Date(now.getTime() - input.windowDays * 24 * 60 * 60 * 1000);

  // Retired units are not part of availability: including them would flatter
  // the number with assets nobody expects to work.
  const live = input.assets.filter((asset) => asset.status !== 'RETIRED');
  const liveIds = new Set(live.map((asset) => asset.id));

  const jobs = input.jobs.filter((job) => liveIds.has(job.assetId));
  const openJobs = jobs.filter((job) => job.status === 'REPORTED' || job.status === 'IN_PROGRESS');
  const completedJobs = jobs.filter((job) => WORKED_JOB_STATUSES.includes(job.status));

  // Downtime counted against the window, not the lifetime of the card: a unit
  // that has been down for a month is 30 days of *this* window, not all of it.
  let downtime = 0;
  for (const job of jobs) {
    const start = asDate(job.reportedAt);
    if (!start) continue;
    const end = asDate(job.completedAt) ?? now;
    if (isPlannedWork(job.type) || job.status === 'CANCELLED') continue;
    downtime += overlapMinutes(start, end, windowStart, now);
  }

  const basisMinutes = live.length * input.windowDays * 24 * 60;
  const availabilityFigure = availability(downtime, basisMinutes);

  const comebacks = completedJobs.filter((job) => Boolean(job.priorJobId));
  const comebackShare = completedJobs.length
    ? Math.round((comebacks.length / completedJobs.length) * 1000) / 10
    : null;

  // Rework inside a warranty window is money the operator has already spent and
  // cannot invoice. Only jobs with a *recorded* term contribute: an unrecorded
  // term is UNKNOWN, and guessing it into this figure would be the same lie in
  // the other direction.
  const warrantyExposure = roundMoney(
    comebacks
      .filter((job) => {
        const reportedAt = asDate(job.reportedAt) ?? now;
        const prior = job.priorJob;
        return prior ? warrantyPosition(prior, reportedAt) === 'IN_WARRANTY' : false;
      })
      .reduce((sum, job) => sum + (job.costs ?? []).reduce((row, cost) => row + (cost.amount ?? 0), 0), 0),
  );

  const byClass = rollUpByClass(live, jobs, input.windowDays, now);

  const findings: MaintenanceFinding[] = [];

  if (availabilityFigure.percent !== null && availabilityFigure.percent < MAINTENANCE_THRESHOLDS.availabilityWarnPercent) {
    findings.push({
      code: 'availability',
      severity: 'attention',
      message: `Availability is ${availabilityFigure.percent}% over the last ${input.windowDays} days — ${toHours(downtime)} hours lost against a fleet of ${live.length}.`,
    });
  }

  const longDown = live.filter((asset) => UNAVAILABLE_ASSET_STATUSES.includes(asset.status));
  for (const asset of longDown) {
    const openForAsset = jobs
      .filter((job) => job.assetId === asset.id && (job.status === 'REPORTED' || job.status === 'IN_PROGRESS'))
      .map((job) => asDate(job.reportedAt))
      .filter((date): date is Date => date !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const hours = openForAsset ? Math.floor((now.getTime() - openForAsset.getTime()) / 3600000) : null;
    const name = asset.name ? `${asset.assetCode} (${asset.name})` : asset.assetCode;
    const expected = expectedRepairHours(asset.assetClass ?? null);
    const limit = longDownLimitHours(asset.assetClass ?? null);
    if (hours !== null && hours >= limit) {
      findings.push({
        code: `long_down:${asset.id}`,
        severity: 'attention',
        message: `${name} has been out of service for ${hours} hours. A ${assetClassLabel(asset.assetClass ?? null).toLowerCase()} repair is expected to take about ${expected} hours; past ${limit} this is a contract exposure, not a repair.`,
      });
    }
  }

  const stalled = openJobs.filter((job) => {
    const reportedAt = asDate(job.reportedAt);
    if (!reportedAt) return false;
    const startedAt = asDate(job.startedAt);
    const clock = startedAt ?? reportedAt;
    return job.status === 'REPORTED' && now.getTime() - clock.getTime() >= MAINTENANCE_THRESHOLDS.stalledJobHours * 3600000;
  });
  if (stalled.length > 0) {
    const oldest = Math.max(
      ...stalled.map((job) => {
        const reportedAt = asDate(job.reportedAt) ?? now;
        return Math.floor((now.getTime() - reportedAt.getTime()) / 3600000);
      }),
    );
    findings.push({
      code: 'stalled',
      severity: 'attention',
      message: `${stalled.length} job ${stalled.length === 1 ? 'card has' : 'cards have'} not been started, the oldest for ${oldest} hours.`,
    });
  }

  if (comebackShare !== null && comebackShare >= MAINTENANCE_THRESHOLDS.comebackWarnPercent) {
    findings.push({
      code: 'comebacks',
      severity: 'attention',
      message: `${comebackShare}% of completed jobs repeat an earlier fault on the same unit — ${comebacks.length} of ${completedJobs.length}.`,
    });
  }

  if (warrantyExposure > 0) {
    findings.push({
      code: 'warranty',
      severity: 'attention',
      message: `${money(warrantyExposure, currency)} of rework falls inside a warranty window on jobs that were already fixed once.`,
    });
  }

  // The supplier's term, condition included. A unit is counted as at risk only
  // when the term is still live and the service that keeps it live is missing:
  // past the expiry date the operator has nothing to lose by missing it.
  const standings = live.map((asset) => ({
    asset,
    standing: assetWarrantyStanding(
      {
        warrantyStartAt: asset.warrantyStartAt,
        warrantyTermDays: asset.warrantyTermDays,
        warrantyServiceIntervalDays: asset.warrantyServiceIntervalDays,
        lastServiceAt: asset.lastServiceAt,
      },
      now,
    ),
  }));
  const unitsInTerm = standings.filter(
    (row) => row.standing.state === 'IN_WARRANTY' || row.standing.state === 'SERVICE_OVERDUE',
  ).length;
  const overdue = standings.filter((row) => row.standing.state === 'SERVICE_OVERDUE');

  if (overdue.length > 0) {
    const worst = overdue.reduce((a, b) => (b.standing.daysOverdue > a.standing.daysOverdue ? b : a));
    const named = overdue
      .slice(0, 3)
      .map((row) => row.asset.assetCode)
      .join(', ');
    findings.push({
      code: 'warranty_condition',
      severity: 'attention',
      message: `${overdue.length} ${overdue.length === 1 ? 'unit is' : 'units are'} inside a supplier term whose service condition has been missed — ${named}${overdue.length > 3 ? ' and others' : ''}. ${worst.asset.assetCode} is ${worst.standing.daysOverdue} days past the last date a service would have kept the cover. A claim today is at the supplier's discretion.`,
    });
  }

  const metrics: MaintenanceMetrics = {
    assets: live.length,
    assetsDown: longDown.length,
    jobsOpen: openJobs.length,
    jobsCompleted: completedJobs.length,
    availabilityPercent: availabilityFigure.percent,
    downtimeHours: toHours(downtime) ?? 0,
    comebackSharePercent: comebackShare,
    warrantyExposure,
    unitsInTerm,
    unitsServiceOverdue: overdue.length,
  };

  if (live.length === 0) {
    return {
      status: 'ok',
      headline: 'No assets on the register yet.',
      findings: [],
      metrics,
      byClass,
    };
  }

  if (availabilityFigure.percent === null) {
    return {
      status: 'ok',
      headline: `No availability figure yet — ${live.length} assets, no downtime recorded in the last ${input.windowDays} days.`,
      findings,
      metrics,
      byClass,
    };
  }

  const headline =
    findings.length === 0
      ? `Availability ${availabilityFigure.percent}% across ${live.length} units, ${openJobs.length} open.`
      : findings[0].message;

  return {
    status: findings.some((f) => f.severity === 'attention') ? 'attention' : 'ok',
    headline,
    findings,
    metrics,
    byClass,
  };
}
