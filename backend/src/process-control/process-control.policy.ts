/**
 * Process Control — pure policy.
 *
 * Everything in this file is a deterministic function of its arguments: no
 * database, no clock (callers pass timestamps), no environment lookups except
 * the explicit feature-flag helpers at the bottom. That keeps the rules that
 * decide "may this standard change?", "may this process advance?" and "is this
 * version immutable?" unit-testable in isolation — which is the point: these
 * are the rules an auditor will ask about.
 */

import { createHash } from 'crypto';

// ── Lifecycle ───────────────────────────────────────────────────────────────

export type ProcessLifecycleStatus = 'DRAFT' | 'PILOT' | 'APPROVED' | 'RETIRED';

export const VERSION_LIFECYCLE: Record<ProcessLifecycleStatus, ProcessLifecycleStatus[]> = {
  DRAFT: ['PILOT', 'APPROVED', 'RETIRED'],
  PILOT: ['APPROVED', 'DRAFT', 'RETIRED'],
  APPROVED: ['RETIRED'],
  RETIRED: [],
};

export type ProcessInstanceStatus =
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'ABANDONED'
  | 'FAILED';

export const INSTANCE_LIFECYCLE: Record<ProcessInstanceStatus, ProcessInstanceStatus[]> = {
  IN_PROGRESS: ['BLOCKED', 'COMPLETED', 'ABANDONED', 'FAILED'],
  BLOCKED: ['IN_PROGRESS', 'ABANDONED', 'FAILED'],
  COMPLETED: [],
  ABANDONED: [],
  FAILED: [],
};

export const TERMINAL_INSTANCE_STATUSES: ProcessInstanceStatus[] = [
  'COMPLETED',
  'ABANDONED',
  'FAILED',
];

/** A version may only be edited while it is a draft. */
export function isVersionEditable(status: ProcessLifecycleStatus): boolean {
  return status === 'DRAFT';
}

/**
 * Approved versions are frozen forever. A change is expressed as a new version
 * plus a change proposal — never by editing what was approved and executed.
 */
export function isVersionImmutable(status: ProcessLifecycleStatus): boolean {
  return status === 'APPROVED' || status === 'RETIRED';
}

export function canTransitionVersion(
  from: ProcessLifecycleStatus,
  to: ProcessLifecycleStatus,
): boolean {
  if (from === to) return false;
  return (VERSION_LIFECYCLE[from] ?? []).includes(to);
}

export function canTransitionInstance(
  from: ProcessInstanceStatus,
  to: ProcessInstanceStatus,
): boolean {
  if (from === to) return true;
  return (INSTANCE_LIFECYCLE[from] ?? []).includes(to);
}

export function isTerminalInstance(status: ProcessInstanceStatus): boolean {
  return TERMINAL_INSTANCE_STATUSES.includes(status);
}

/** Only versions that have left draft may execute real work. */
export function isVersionExecutable(status: ProcessLifecycleStatus): boolean {
  return status === 'PILOT' || status === 'APPROVED';
}

// ── Steps ───────────────────────────────────────────────────────────────────

export type IncidentSeverity = 'MINOR' | 'MAJOR' | 'BLOCKING' | 'CRITICAL';

/**
 * Severity → does it stop the line? BLOCKING/CRITICAL stop the process until a
 * human resolves it. MINOR/MAJOR are recorded and owned, but the process can
 * continue so we do not freeze a warehouse over a paperwork gap.
 */
export function severityBlocksProcess(severity: IncidentSeverity): boolean {
  return severity === 'BLOCKING' || severity === 'CRITICAL';
}

export function isMandatoryEvidenceSatisfied(
  requiresEvidence: boolean,
  evidenceSchema: unknown,
  evidence: Record<string, unknown> | null | undefined,
): { ok: boolean; missing: string[] } {
  if (!requiresEvidence) return { ok: true, missing: [] };

  const payload = evidence ?? {};
  const missing: string[] = [];

  const required = extractRequiredFields(evidenceSchema);
  for (const field of required) {
    if (!hasValue(payload[field])) missing.push(field);
  }

  // A step that demands evidence but is handed nothing at all is always refused,
  // even if the schema forgot to declare required fields.
  if (required.length === 0 && Object.keys(payload).length === 0) {
    return { ok: false, missing: ['<evidence>'] };
  }

  return { ok: missing.length === 0, missing };
}

/**
 * Minimal, dependency-free support for the evidence/validation rule shapes the
 * Process Book uses. Deliberately NOT a general JSON-Schema engine — a small
 * surface we can reason about and test.
 *
 *   evidenceSchema: { required: ['countedQty', 'photoKey'] }
 *   validationRules: {
 *     nonNegative: ['countedQty'],
 *     positive: ['countedQty'],
 *     notEmpty: ['photoKey'],
 *     equals: { receivedQty: 'expectedQty' },
 *     maxVariancePct: { field: 'countedQty', reference: 'expectedQty', pct: 2 }
 *   }
 */
export function extractRequiredFields(evidenceSchema: unknown): string[] {
  if (!evidenceSchema || typeof evidenceSchema !== 'object') return [];
  const required = (evidenceSchema as { required?: unknown }).required;
  if (!Array.isArray(required)) return [];
  return required.filter((f): f is string => typeof f === 'string' && f.length > 0);
}

export interface RuleEvaluation {
  ok: boolean;
  violations: string[];
}

export function evaluateValidationRules(
  rules: unknown,
  payload: Record<string, unknown> | null | undefined,
): RuleEvaluation {
  if (!rules || typeof rules !== 'object') return { ok: true, violations: [] };
  const data = payload ?? {};
  const r = rules as Record<string, any>;
  const violations: string[] = [];

  for (const field of asStringArray(r.nonNegative)) {
    const value = data[field];
    if (value === undefined || value === null) continue;
    if (!isFiniteNumber(value) || Number(value) < 0) {
      violations.push(`${field} must be a number >= 0`);
    }
  }

  for (const field of asStringArray(r.positive)) {
    const value = data[field];
    if (value === undefined || value === null) continue;
    if (!isFiniteNumber(value) || Number(value) <= 0) {
      violations.push(`${field} must be a number > 0`);
    }
  }

  for (const field of asStringArray(r.notEmpty)) {
    if (!hasValue(data[field])) violations.push(`${field} must not be empty`);
  }

  if (r.equals && typeof r.equals === 'object') {
    for (const [left, right] of Object.entries(r.equals as Record<string, string>)) {
      if (!hasValue(data[left])) continue;
      if (String(data[left]) !== String(data[right])) {
        violations.push(`${left} must equal ${right}`);
      }
    }
  }

  if (r.maxVariancePct && typeof r.maxVariancePct === 'object') {
    const { field, reference, pct } = r.maxVariancePct as {
      field?: string;
      reference?: string;
      pct?: number;
    };
    if (field && reference && isFiniteNumber(pct)) {
      const actual = Number(data[field]);
      const expected = Number(data[reference]);
      if (isFiniteNumber(actual) && isFiniteNumber(expected) && expected !== 0) {
        const variancePct = Math.abs((actual - expected) / expected) * 100;
        if (variancePct > Number(pct)) {
          violations.push(
            `${field} differs from ${reference} by ${variancePct.toFixed(2)}% (max ${pct}%)`,
          );
        }
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

export interface StepDefinitionLike {
  code?: string | null;
  nextStepOnSuccess?: string | null;
  nextStepOnFailure?: string | null;
  nextStepOnException?: string | null;
}

export type StepOutcome = 'SUCCESS' | 'FAILURE' | 'EXCEPTION';

/**
 * Where does execution go after a step finishes? Returns the step *code* to
 * move to, or null when the process is done (no configured successor).
 */
export function resolveNextStepCode(
  step: StepDefinitionLike,
  outcome: StepOutcome,
): string | null {
  const code =
    outcome === 'SUCCESS'
      ? step.nextStepOnSuccess
      : outcome === 'FAILURE'
        ? step.nextStepOnFailure
        : step.nextStepOnException;
  return code && code.trim().length > 0 ? code : null;
}

export function canRoleExecuteStep(
  allowedRoles: string[] | null | undefined,
  role: string | null | undefined,
  permissionOverride?: boolean,
): boolean {
  if (permissionOverride === true) return true;
  const roles = allowedRoles ?? [];
  // No role restriction declared → any authenticated operator in the tenant may
  // execute it.
  if (roles.length === 0) return true;
  if (!role) return false;
  return roles.includes(role);
}

// ── Outcomes ────────────────────────────────────────────────────────────────

export interface OutcomeFacts {
  totalSteps: number;
  completedSteps: number;
  incidentCount: number;
  blockingIncidentCount: number;
  openBlockingIncidentCount: number;
  startedAt: Date;
  completedAt: Date;
}

export interface OutcomeEvaluation {
  status: 'COMPLETED' | 'COMPLETED_WITH_EXCEPTIONS';
  firstTimeRight: boolean;
  durationMinutes: number;
  reasons: string[];
}

/**
 * An outcome is the measured truth of one execution: did it finish, how long
 * did it take, and was it clean first time? "Clean" means no incidents at all —
 * a resolved exception still makes this not-first-time-right, because the
 * process did not work the way the standard intended.
 */
export function evaluateOutcome(facts: OutcomeFacts): OutcomeEvaluation {
  const reasons: string[] = [];
  const firstTimeRight = facts.incidentCount === 0;

  if (facts.openBlockingIncidentCount > 0) {
    reasons.push('blocking incident(s) still open');
  }
  if (facts.incidentCount > 0) {
    reasons.push(`${facts.incidentCount} incident(s) recorded`);
  }

  const durationMs = facts.completedAt.getTime() - facts.startedAt.getTime();

  return {
    status: firstTimeRight ? 'COMPLETED' : 'COMPLETED_WITH_EXCEPTIONS',
    firstTimeRight,
    durationMinutes: Math.max(0, Math.round(durationMs / 60000)),
    reasons,
  };
}

/** Can an outcome be recorded for this instance right now? */
export function canRecordOutcome(input: {
  instanceStatus: ProcessInstanceStatus;
  openBlockingIncidentCount: number;
  remainingSteps: number;
}): { ok: boolean; reason?: string } {
  if (isTerminalInstance(input.instanceStatus)) {
    return { ok: false, reason: `instance is already ${input.instanceStatus}` };
  }
  if (input.openBlockingIncidentCount > 0) {
    return { ok: false, reason: 'a blocking incident must be resolved first' };
  }
  if (input.remainingSteps > 0) {
    return { ok: false, reason: `${input.remainingSteps} step(s) still open` };
  }
  return { ok: true };
}

// ── Content hashing (immutability evidence) ─────────────────────────────────

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Deterministic JSON: object keys sorted, so the same content always hashes the same. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(sortValue) as Json[];
  if (typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, Json> = {};
    for (const key of Object.keys(src).sort()) {
      if (src[key] === undefined) continue;
      out[key] = sortValue(src[key]);
    }
    return out;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  return value as Json;
}

/**
 * SHA-256 over the ordered steps and automation rules of a version. Stored on
 * the version so an auditor can prove which standard was in force.
 */
export function computeVersionContentHash(
  steps: unknown[],
  automationRules: unknown[] = [],
): string {
  const payload = stableStringify({
    steps: steps ?? [],
    automationRules: automationRules ?? [],
  });
  return createHash('sha256').update(payload).digest('hex');
}

// ── Incident codes ──────────────────────────────────────────────────────────

export const GOODS_RECEIPT_INCIDENT_CODES = {
  QUANTITY_VARIANCE: 'QUANTITY_VARIANCE',
  DAMAGED_GOODS: 'DAMAGED_GOODS',
  PUT_AWAY_MISSING: 'PUT_AWAY_MISSING',
  UNKNOWN_SKU: 'UNKNOWN_SKU',
} as const;

export type GoodsReceiptIncidentCode =
  (typeof GOODS_RECEIPT_INCIDENT_CODES)[keyof typeof GOODS_RECEIPT_INCIDENT_CODES];

// ── Feature flags ───────────────────────────────────────────────────────────

function flag(value: string | undefined, fallback = false): boolean {
  if (value == null || value === '') return fallback;
  return value === 'true' || value === '1';
}

/**
 * Master switch for Process Control. Off by default: nothing in the application
 * may execute a standard until a tenant (and the operator) has been through the
 * gated rollout.
 */
export function isProcessControlEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return flag(env.PROCESS_CONTROL_ENABLED, false);
}

/** The WMS goods-receipt bridge is a second, narrower switch. */
export function isWmsReceiptBridgeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return flag(env.PROCESS_CONTROL_ENABLED, false) && flag(env.PROCESS_CONTROL_WMS_RECEIPT_ENABLED, false);
}

/**
 * Enforcement mode: when true, a receipt that raises a blocking incident cannot
 * be completed in the WMS. When false (the default) the standard observes and
 * records but does not stop the operator — the safe way to pilot.
 */
export function isWmsReceiptBridgeEnforcing(env: NodeJS.ProcessEnv = process.env): boolean {
  return flag(env.PROCESS_CONTROL_WMS_RECEIPT_ENFORCE, false);
}

/**
 * Fail-closed in production. Process Control has no production rollout: even if
 * the enable flags are mistakenly set in a production environment, the
 * capability stays off unless a human has explicitly unlocked it with
 * PROCESS_CONTROL_PRODUCTION_ALLOWED=true.
 */
export function isProcessControlAllowedInEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== 'production') return true;
  return flag(env.PROCESS_CONTROL_PRODUCTION_ALLOWED, false);
}

export interface ProcessControlGate {
  allowed: boolean;
  reason?: string;
}

export function processControlGate(env: NodeJS.ProcessEnv = process.env): ProcessControlGate {
  if (!isProcessControlAllowedInEnv(env)) {
    return {
      allowed: false,
      reason:
        'Process Control is disabled in production (set PROCESS_CONTROL_PRODUCTION_ALLOWED=true only after the production gates in the charter are signed off)',
    };
  }
  if (!isProcessControlEnabled(env)) {
    return {
      allowed: false,
      reason: 'Process Control is disabled (PROCESS_CONTROL_ENABLED is not true)',
    };
  }
  return { allowed: true };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}
