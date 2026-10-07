/**
 * Driver dispatch compliance — the single policy.
 *
 * WHY THIS IS A PURE MODULE
 * -------------------------
 * Compliance was previously checked in (at most) one code path, and the guard
 * that claimed to centralise it read columns that do not exist on the Driver
 * model, so it could never have run. Dispatch, manual assignment, route
 * creation and the driver app therefore each had their own (or no) rules.
 *
 * This file holds the decision table only: no Prisma, no Nest, no clock —
 * `now` and the snapshot are inputs. That makes the policy exhaustively unit
 * testable and impossible for one caller to quietly widen.
 *
 * SEVERITIES
 * ----------
 *  - BLOCK: the driver must not be dispatched on ANY path.
 *  - WARN : visible on the dispatch screen, does not stop the assignment
 *           (e.g. a document expiring within the warning window, or a missing
 *           document when `requireDocuments` is off during rollout).
 *
 * MISSING EVIDENCE IS NEVER SILENT
 * --------------------------------
 * A driver with no licence/insurance/background-check date on file is reported
 * as `unverifiedDocuments`, never as compliant-but-unmentioned. Whether that
 * blocks dispatch is a single explicit switch (`requireDocuments`, wired to
 * DRIVER_REQUIRE_DOCUMENTS) so go-live is a deliberate decision, not an
 * accident of which field somebody forgot to fill in.
 */

export type ComplianceSeverity = 'BLOCK' | 'WARN';

export interface ComplianceIssue {
  /** Stable machine-readable code — safe to branch on, log and audit. */
  code: string;
  severity: ComplianceSeverity;
  message: string;
  /** The driver field the decision came from, when there is one. */
  field?: string;
}

/** Everything the policy is allowed to look at. Loaded by DriverComplianceService. */
export interface DriverComplianceSnapshot {
  driverId: string;
  companyId: string;
  /** Human label — carried through so callers can attribute decisions. */
  name?: string | null;
  isActive: boolean;
  /** DriverStatus: AVAILABLE | ON_ROUTE | OFFLINE. */
  status: string;
  licenseExpiry?: Date | null;
  insuranceExpiry?: Date | null;
  backgroundCheckExpiry?: Date | null;
  nextServiceDate?: Date | null;
  currentKm?: number | null;
  nextServiceKm?: number | null;
  complianceHold?: boolean | null;
  complianceHoldReason?: string | null;
  /** Unresolved CRITICAL safety alerts on this driver (see SafetyAlert). */
  criticalSafetyAlerts?: number;
}

export interface DriverComplianceOptions {
  /** Reference clock (defaults to `new Date()`); injected in tests. */
  now?: Date;
  /**
   * When true, a document that is not on file (<field> = NULL) blocks dispatch.
   * Default false so a fleet with no licence data captured yet can still run;
   * flip DRIVER_REQUIRE_DOCUMENTS=true once the data is backfilled.
   */
  requireDocuments?: boolean;
  /** Days before expiry that raise a WARN (default 14). */
  warningWindowDays?: number;
  /** Driver statuses that count as available for dispatch. */
  availableStatuses?: readonly string[];
}

export interface DriverComplianceResult {
  driverId: string;
  companyId: string;
  /** No BLOCK-severity issues. */
  compliant: boolean;
  /** Alias kept for callers that ask "can I dispatch this driver?". */
  dispatchable: boolean;
  blockers: ComplianceIssue[];
  warnings: ComplianceIssue[];
  issues: ComplianceIssue[];
  /** Fields that are required-but-empty (subset of warnings/blockers). */
  unverifiedDocuments: string[];
  checkedAt: Date;
}

const DEFAULT_WARNING_WINDOW_DAYS = 14;
const DEFAULT_AVAILABLE_STATUSES = ['AVAILABLE'] as const;
const DAY_MS = 86_400_000;

/** Odometer reading at which we warn about an upcoming service (90% used). */
const SERVICE_KM_WARN_RATIO = 0.9;

function daysUntil(expiry: Date, now: Date): number {
  return (expiry.getTime() - now.getTime()) / DAY_MS;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Evaluate one driver against the single compliance policy.
 *
 * Ordering of issues is stable so audit output and UI lists are diffable.
 */
export function evaluateDriverCompliance(
  snapshot: DriverComplianceSnapshot,
  options: DriverComplianceOptions = {},
): DriverComplianceResult {
  const now = options.now ?? new Date();
  const warningWindowDays = options.warningWindowDays ?? DEFAULT_WARNING_WINDOW_DAYS;
  const availableStatuses = options.availableStatuses ?? DEFAULT_AVAILABLE_STATUSES;
  const requireDocuments = options.requireDocuments === true;

  const blockers: ComplianceIssue[] = [];
  const warnings: ComplianceIssue[] = [];
  const unverifiedDocuments: string[] = [];

  const document = (
    field: 'licenseExpiry' | 'insuranceExpiry' | 'backgroundCheckExpiry',
    label: string,
    value: Date | null | undefined,
  ) => {
    if (!value) {
      unverifiedDocuments.push(field);
      const message = `${label} is not on file`;
      if (requireDocuments) {
        blockers.push({ code: `${field.toUpperCase()}_MISSING`, severity: 'BLOCK', message, field });
      } else {
        warnings.push({ code: `${field.toUpperCase()}_MISSING`, severity: 'WARN', message, field });
      }
      return;
    }
    const expiry = new Date(value);
    if (Number.isNaN(expiry.getTime())) {
      blockers.push({
        code: `${field.toUpperCase()}_INVALID`,
        severity: 'BLOCK',
        message: `${label} is not a valid date`,
        field,
      });
      return;
    }
    const remainingDays = daysUntil(expiry, now);
    if (remainingDays < 0) {
      blockers.push({
        code: `${field.toUpperCase()}_EXPIRED`,
        severity: 'BLOCK',
        message: `${label} expired ${Math.abs(Math.floor(remainingDays))} day(s) ago`,
        field,
      });
    } else if (remainingDays <= warningWindowDays) {
      warnings.push({
        code: `${field.toUpperCase()}_EXPIRING`,
        severity: 'WARN',
        message: `${label} expires in ${Math.max(0, Math.floor(remainingDays))} day(s)`,
        field,
      });
    }
  };

  // 1. Tenant/company identity — a mismatched snapshot is a hard stop.
  if (!snapshot.driverId) {
    blockers.push({ code: 'DRIVER_MISSING', severity: 'BLOCK', message: 'Driver record is missing' });
  }

  // 2. Active status.
  if (!snapshot.isActive) {
    blockers.push({
      code: 'DRIVER_INACTIVE',
      severity: 'BLOCK',
      message: 'Driver account is inactive',
      field: 'isActive',
    });
  }

  // 3. Explicit operational hold (always wins; ops set it deliberately).
  if (snapshot.complianceHold) {
    blockers.push({
      code: 'COMPLIANCE_HOLD',
      severity: 'BLOCK',
      message: snapshot.complianceHoldReason
        ? `Driver is on compliance hold: ${snapshot.complianceHoldReason}`
        : 'Driver is on a compliance hold',
      field: 'complianceHold',
    });
  }

  // 4. Availability — dispatch may only use a driver who is AVAILABLE.
  if (!availableStatuses.includes(snapshot.status)) {
    blockers.push({
      code: 'DRIVER_NOT_AVAILABLE',
      severity: 'BLOCK',
      message: `Driver status is ${snapshot.status}, not ${availableStatuses.join('/')}`,
      field: 'status',
    });
  }

  // 5. Documents: licence, insurance, background check.
  document('licenseExpiry', 'Driving licence / PrDP', snapshot.licenseExpiry);
  document('insuranceExpiry', 'Insurance cover', snapshot.insuranceExpiry);
  document('backgroundCheckExpiry', 'Background check', snapshot.backgroundCheckExpiry);

  // 6. Vehicle service — overdue blocks, upcoming warns.
  if (snapshot.nextServiceDate) {
    const due = new Date(snapshot.nextServiceDate);
    if (Number.isNaN(due.getTime())) {
      blockers.push({
        code: 'SERVICE_DATE_INVALID',
        severity: 'BLOCK',
        message: 'Next service date is not a valid date',
        field: 'nextServiceDate',
      });
    } else {
      const remainingDays = daysUntil(due, now);
      if (remainingDays < 0) {
        blockers.push({
          code: 'SERVICE_OVERDUE',
          severity: 'BLOCK',
          message: `Vehicle service overdue by ${Math.abs(Math.floor(remainingDays))} day(s)`,
          field: 'nextServiceDate',
        });
      } else if (remainingDays <= warningWindowDays) {
        warnings.push({
          code: 'SERVICE_DUE_SOON',
          severity: 'WARN',
          message: `Vehicle service due in ${Math.max(0, Math.floor(remainingDays))} day(s)`,
          field: 'nextServiceDate',
        });
      }
    }
  }

  // 7. Odometer-based service interval.
  if (
    snapshot.currentKm != null &&
    snapshot.nextServiceKm != null &&
    Number.isFinite(snapshot.currentKm) &&
    Number.isFinite(snapshot.nextServiceKm) &&
    snapshot.nextServiceKm > 0
  ) {
    if (snapshot.currentKm >= snapshot.nextServiceKm) {
      blockers.push({
        code: 'SERVICE_KM_EXCEEDED',
        severity: 'BLOCK',
        message: `Odometer ${snapshot.currentKm} km has passed the ${snapshot.nextServiceKm} km service point`,
        field: 'nextServiceKm',
      });
    } else if (snapshot.currentKm >= snapshot.nextServiceKm * SERVICE_KM_WARN_RATIO) {
      warnings.push({
        code: 'SERVICE_KM_DUE_SOON',
        severity: 'WARN',
        message: `Odometer ${snapshot.currentKm} km is within ${round1(
          (snapshot.nextServiceKm - snapshot.currentKm) / 1000,
        )}k km of the ${snapshot.nextServiceKm} km service point`,
        field: 'nextServiceKm',
      });
    }
  }

  // 8. Unresolved critical safety alerts (crime-hotspot / driving incidents).
  if ((snapshot.criticalSafetyAlerts ?? 0) > 0) {
    blockers.push({
      code: 'CRITICAL_SAFETY_ALERT',
      severity: 'BLOCK',
      message: `Driver has ${snapshot.criticalSafetyAlerts} unresolved critical safety alert(s)`,
    });
  }

  const issues = [...blockers, ...warnings];
  const compliant = blockers.length === 0;

  return {
    driverId: snapshot.driverId,
    companyId: snapshot.companyId,
    compliant,
    dispatchable: compliant,
    blockers,
    warnings,
    issues,
    unverifiedDocuments,
    checkedAt: now,
  };
}

/** Compact, human-readable reason string for exceptions and audit rows. */
export function describeCompliance(result: DriverComplianceResult): string {
  if (result.compliant) {
    return result.warnings.length
      ? `Compliant with warnings: ${result.warnings.map((w) => w.message).join('; ')}`
      : 'Compliant';
  }
  return result.blockers.map((b) => b.message).join('; ');
}
