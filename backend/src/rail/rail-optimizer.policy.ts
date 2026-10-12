/**
 * Rail Slot Optimizer — pure scheduling policy.
 *
 * This is a CONSTRAINT-SATISFYING DECISION SUPPORT engine, not an autonomous
 * scheduler: every recommendation is explainable ("why") and must be applied by
 * a human through the existing allocation workflow (charter principle 8:
 * "Automation assists; humans decide"). It never invents capacity: a corridor
 * with no declared weekly capacity produces no allocations — same philosophy as
 * the envelope check's UNVERIFIED outcome.
 *
 * Constraints honoured, in evaluation order:
 *   1. Time        — a requested window that has already passed cannot be allocated.
 *   2. Envelope    — an INCOMPATIBLE corridor envelope is a hard reject.
 *   3. Compliance  — missing/expired operator documents defer, they don't reject
 *                    (documents can be renewed; the application is not at fault).
 *   4. Data        — a request without a stated weekly train demand is deferred
 *                    until the demand is known (never assumed to be 1).
 *   5. Capacity    — declared trains-per-week per corridor, minus already-allocated
 *                    demand, minus higher-priority proposals accepted this run.
 *   6. Possessions — a window wholly inside a planned possession is deferred;
 *                    partial overlap only warns (the human may still accept).
 *
 * Deterministic ordering (same input → same output):
 *   envelope COMPATIBLE → UNVERIFIED → unknown → INCOMPATIBLE,
 *   then compliance-satisfied first, then first-come (requestedFrom), then
 *   applicationNumber as the tie-break.
 */

export type OptimizerDecision = 'ALLOCATE' | 'DEFER' | 'REJECT';

export interface OptimizerCapacity {
  corridorCode: string;
  /** Declared trains per week the corridor can carry (e.g. from Annexure 33b). */
  trainsPerWeek: number;
}

export interface OptimizerPossession {
  windowId: string;
  corridorCode: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
}

export interface OptimizerCandidate {
  id: string;
  applicationNumber: string;
  corridorCode: string;
  requestedFrom: Date;
  requestedUntil: Date;
  /** Weekly train demand stated on the application; null = not stated. */
  trainsPerWeek: number | null;
  envelopeCheckStatus: 'COMPATIBLE' | 'INCOMPATIBLE' | 'UNVERIFIED' | null;
  complianceOk: boolean;
  complianceBlockers: string[];
  isDangerousGoods: boolean;
}

export interface OptimizerExistingAllocation {
  applicationNumber: string;
  corridorCode: string;
  trainsPerWeek: number | null;
}

export interface OptimizerProposal {
  applicationId: string;
  applicationNumber: string;
  corridorCode: string;
  decision: OptimizerDecision;
  score: number;
  weeklyDemand: number | null;
  reasons: string[];
  warnings: string[];
}

export interface CorridorUtilization {
  corridorCode: string;
  capacityPerWeek: number | null;
  allocatedPerWeek: number;
  proposedPerWeek: number;
  deferredPerWeek: number;
  remainingPerWeek: number | null;
}

export interface OptimizerResult {
  proposals: OptimizerProposal[];
  utilization: CorridorUtilization[];
  generatedAt: string;
  notes: string[];
}

export interface OptimizerInput {
  candidates: OptimizerCandidate[];
  capacity: OptimizerCapacity[];
  possessions: OptimizerPossession[];
  existingAllocations: OptimizerExistingAllocation[];
  now?: Date;
}

function envelopeRank(status: OptimizerCandidate['envelopeCheckStatus']): number {
  switch (status) {
    case 'COMPATIBLE': return 0;
    case 'UNVERIFIED': return 1;
    case null: return 2;
    case 'INCOMPATIBLE': return 3;
  }
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

function whollyInside(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() >= bStart.getTime() && aEnd.getTime() <= bEnd.getTime();
}

function scoreOf(c: OptimizerCandidate): number {
  const envelope = c.envelopeCheckStatus === 'COMPATIBLE' ? 100
    : c.envelopeCheckStatus === 'UNVERIFIED' ? 60
    : c.envelopeCheckStatus === null ? 20 : 0;
  const compliance = c.complianceOk ? 40 : 0;
  const demand = c.trainsPerWeek !== null ? 10 : 0;
  return envelope + compliance + demand;
}

export function optimizeSlotSchedule(input: OptimizerInput): OptimizerResult {
  const now = input.now ?? new Date();
  const notes: string[] = [];

  const capacityByCorridor = new Map<string, number>();
  for (const c of input.capacity) {
    if (Number.isFinite(c.trainsPerWeek) && c.trainsPerWeek >= 0) {
      capacityByCorridor.set(c.corridorCode, c.trainsPerWeek);
    }
  }

  // Existing ALLOCATED demand consumes capacity first — a new proposal never
  // displaces what has already been allocated.
  const used = new Map<string, number>();
  for (const a of input.existingAllocations) {
    const demand = a.trainsPerWeek ?? 0;
    used.set(a.corridorCode, (used.get(a.corridorCode) ?? 0) + demand);
    if (a.trainsPerWeek === null) {
      notes.push(`Allocated application ${a.applicationNumber} states no weekly demand — counted as 0 for capacity; correct the record.`);
    }
  }
  for (const [corridor, demand] of used) {
    const cap = capacityByCorridor.get(corridor);
    if (cap !== undefined && demand > cap) {
      notes.push(`Corridor ${corridor} is over its declared capacity (allocated ${demand}/week vs declared ${cap}/week) — no new allocations proposed until this is resolved.`);
    }
  }

  const ordered = [...input.candidates].sort((a, b) =>
    envelopeRank(a.envelopeCheckStatus) - envelopeRank(b.envelopeCheckStatus)
    || Number(b.complianceOk) - Number(a.complianceOk)
    || a.requestedFrom.getTime() - b.requestedFrom.getTime()
    || a.applicationNumber.localeCompare(b.applicationNumber),
  );

  const proposals: OptimizerProposal[] = [];
  const proposedPerCorridor = new Map<string, number>();
  const deferredPerCorridor = new Map<string, number>();

  for (const c of ordered) {
    const reasons: string[] = [];
    const warnings: string[] = [];
    let decision: OptimizerDecision = 'ALLOCATE';

    // 1. Time
    if (c.requestedUntil.getTime() < now.getTime()) {
      decision = 'REJECT';
      reasons.push('The requested validity window has already passed — a fresh application is required.');
    }

    // 2. Envelope
    if (decision === 'ALLOCATE' && c.envelopeCheckStatus === 'INCOMPATIBLE') {
      decision = 'REJECT';
      reasons.push('Corridor envelope check is INCOMPATIBLE (gauge / axle-load / profile limit violated).');
    } else if (c.envelopeCheckStatus === 'UNVERIFIED' || c.envelopeCheckStatus === null) {
      warnings.push('Corridor envelope is not verified against Chapter 2 limits — allocation proceeds but the wagon-to-corridor fit is unproven.');
    }

    // 3. Compliance — defers, never rejects
    if (decision !== 'REJECT' && !c.complianceOk) {
      decision = 'DEFER';
      reasons.push(`Operator compliance not satisfied for allocation: ${c.complianceBlockers.join(' ') || 'documents missing.'}`);
    }

    // 4. Data quality — stated weekly demand
    if (decision === 'ALLOCATE' && (c.trainsPerWeek === null || !Number.isFinite(c.trainsPerWeek) || c.trainsPerWeek <= 0)) {
      decision = 'DEFER';
      reasons.push('Weekly train demand (trainsPerWeek) is not stated on the application — record it before allocating; demand is never assumed.');
    }

    // 5. Capacity
    const cap = capacityByCorridor.get(c.corridorCode);
    if (decision === 'ALLOCATE' && cap === undefined) {
      decision = 'DEFER';
      reasons.push(`No weekly capacity has been declared for corridor ${c.corridorCode} — supply the Annexure 33b figure to enable allocation.`);
    }
    const alreadyUsed = (used.get(c.corridorCode) ?? 0) + (proposedPerCorridor.get(c.corridorCode) ?? 0);
    if (decision === 'ALLOCATE' && cap !== undefined && c.trainsPerWeek !== null) {
      if (alreadyUsed + c.trainsPerWeek > cap) {
        decision = 'DEFER';
        reasons.push(`Corridor ${c.corridorCode} capacity is ${cap} trains/week — ${alreadyUsed} already allocated/proposed and this request needs ${c.trainsPerWeek}.`);
      }
    }

    // 6. Possessions
    const inWindow = input.possessions.filter((p) => p.corridorCode === c.corridorCode
      && overlaps(c.requestedFrom, c.requestedUntil, p.startsAt, p.endsAt));
    for (const p of inWindow) {
      if (whollyInside(c.requestedFrom, c.requestedUntil, p.startsAt, p.endsAt)) {
        decision = decision === 'REJECT' ? 'REJECT' : 'DEFER';
        reasons.push(`The requested window lies entirely inside planned possession "${p.title}" — re-time the request or complete the possession first.`);
      } else {
        warnings.push(`Requested window partially overlaps planned possession "${p.title}".`);
      }
    }

    if (decision === 'ALLOCATE' && c.trainsPerWeek !== null) {
      proposedPerCorridor.set(c.corridorCode, (proposedPerCorridor.get(c.corridorCode) ?? 0) + c.trainsPerWeek);
      reasons.push(`Fits declared capacity (${alreadyUsed + c.trainsPerWeek} of ${cap} trains/week on ${c.corridorCode}).`);
    }
    if (decision === 'DEFER') {
      deferredPerCorridor.set(c.corridorCode, (deferredPerCorridor.get(c.corridorCode) ?? 0) + (c.trainsPerWeek ?? 0));
    }
    if (decision === 'REJECT') {
      // rejected demand does not consume capacity
    }

    proposals.push({
      applicationId: c.id,
      applicationNumber: c.applicationNumber,
      corridorCode: c.corridorCode,
      decision,
      score: scoreOf(c),
      weeklyDemand: c.trainsPerWeek,
      reasons,
      warnings,
    });
  }

  // Utilization summary
  const corridors = new Set<string>([
    ...capacityByCorridor.keys(), ...used.keys(), ...proposedPerCorridor.keys(), ...deferredPerCorridor.keys(),
  ]);
  const utilization: CorridorUtilization[] = [...corridors].sort().map((corridorCode) => {
    const capacityPerWeek = capacityByCorridor.get(corridorCode) ?? null;
    const allocatedPerWeek = used.get(corridorCode) ?? 0;
    const proposed = proposedPerCorridor.get(corridorCode) ?? 0;
    const deferred = deferredPerCorridor.get(corridorCode) ?? 0;
    return {
      corridorCode,
      capacityPerWeek,
      allocatedPerWeek,
      proposedPerWeek: proposed,
      deferredPerWeek: deferred,
      remainingPerWeek: capacityPerWeek === null ? null : capacityPerWeek - allocatedPerWeek - proposed,
    };
  });

  return { proposals, utilization, generatedAt: now.toISOString(), notes };
}
