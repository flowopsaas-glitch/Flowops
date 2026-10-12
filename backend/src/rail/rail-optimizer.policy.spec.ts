import {
  optimizeSlotSchedule, OptimizerCandidate, OptimizerInput,
} from './rail-optimizer.policy';

const NOW = new Date('2026-10-10T12:00:00Z');

function candidate(over: Partial<OptimizerCandidate> & { id: string; applicationNumber: string }): OptimizerCandidate {
  return {
    corridorCode: 'COR-ORE',
    requestedFrom: new Date('2026-11-01T00:00:00Z'),
    requestedUntil: new Date('2027-03-31T00:00:00Z'),
    trainsPerWeek: 2,
    envelopeCheckStatus: 'COMPATIBLE',
    complianceOk: true,
    complianceBlockers: [],
    isDangerousGoods: false,
    ...over,
  };
}

function run(partial: Partial<OptimizerInput> & { candidates: OptimizerCandidate[] }) {
  return optimizeSlotSchedule({
    capacity: [], possessions: [], existingAllocations: [], now: NOW, ...partial,
  });
}

describe('optimizeSlotSchedule', () => {
  it('allocates a clean request that fits declared capacity, with a transparent reason', () => {
    const r = run({
      candidates: [candidate({ id: 'a1', applicationNumber: 'SA-2026-00001', trainsPerWeek: 3 })],
      capacity: [{ corridorCode: 'COR-ORE', trainsPerWeek: 5 }],
    });
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0].decision).toBe('ALLOCATE');
    expect(r.proposals[0].reasons.join(' ')).toContain('3 of 5 trains/week');
    expect(r.utilization[0]).toMatchObject({
      corridorCode: 'COR-ORE', capacityPerWeek: 5, allocatedPerWeek: 0, proposedPerWeek: 3, remainingPerWeek: 2,
    });
  });

  it('never invents capacity: a corridor with no declared capacity is DEFERRED, not allocated', () => {
    const r = run({ candidates: [candidate({ id: 'a1', applicationNumber: 'SA-2026-00001' })] });
    expect(r.proposals[0].decision).toBe('DEFER');
    expect(r.proposals[0].reasons.join(' ')).toContain('No weekly capacity has been declared');
  });

  it('rejects an application whose requested window has already passed', () => {
    const r = run({
      candidates: [candidate({
        id: 'a1', applicationNumber: 'SA-2026-00001',
        requestedFrom: new Date('2026-01-01T00:00:00Z'), requestedUntil: new Date('2026-06-01T00:00:00Z'),
      })],
      capacity: [{ corridorCode: 'COR-ORE', trainsPerWeek: 5 }],
    });
    expect(r.proposals[0].decision).toBe('REJECT');
    expect(r.proposals[0].reasons.join(' ')).toContain('already passed');
  });

  it('hard-rejects an INCOMPATIBLE envelope but only warns on UNVERIFIED', () => {
    const incompatible = run({
      candidates: [candidate({ id: 'a1', applicationNumber: 'SA-2026-00001', envelopeCheckStatus: 'INCOMPATIBLE' })],
      capacity: [{ corridorCode: 'COR-ORE', trainsPerWeek: 5 }],
    });
    expect(incompatible.proposals[0].decision).toBe('REJECT');
    expect(incompatible.proposals[0].reasons.join(' ')).toContain('INCOMPATIBLE');

    const unverified = run({
      candidates: [candidate({ id: 'a2', applicationNumber: 'SA-2026-00002', envelopeCheckStatus: 'UNVERIFIED' })],
      capacity: [{ corridorCode: 'COR-ORE', trainsPerWeek: 5 }],
    });
    expect(unverified.proposals[0].decision).toBe('ALLOCATE');
    expect(unverified.proposals[0].warnings.join(' ')).toContain('not verified');
  });

  it('defers (never rejects) on compliance blockers — documents can be renewed', () => {
    const r = run({
      candidates: [candidate({
        id: 'a1', applicationNumber: 'SA-2026-00001',
        complianceOk: false, complianceBlockers: ['RSR safety permit is EXPIRED.'],
      })],
      capacity: [{ corridorCode: 'COR-ORE', trainsPerWeek: 5 }],
    });
    expect(r.proposals[0].decision).toBe('DEFER');
    expect(r.proposals[0].reasons.join(' ')).toContain('RSR safety permit is EXPIRED');
  });

  it('defers when weekly demand is not stated — demand is never assumed to be 1', () => {
    const r = run({
      candidates: [candidate({ id: 'a1', applicationNumber: 'SA-2026-00001', trainsPerWeek: null })],
      capacity: [{ corridorCode: 'COR-ORE', trainsPerWeek: 5 }],
    });
    expect(r.proposals[0].decision).toBe('DEFER');
    expect(r.proposals[0].reasons.join(' ')).toContain('not stated');
  });

  it('fills capacity in deterministic priority order and defers the overflow', () => {
    // Two clean requests of 3 + 4 into 5/week: envelope-equal, first-come wins.
    const r = run({
      candidates: [
        candidate({ id: 'a2', applicationNumber: 'SA-2026-00002', trainsPerWeek: 4, requestedFrom: new Date('2026-11-02T00:00:00Z') }),
        candidate({ id: 'a1', applicationNumber: 'SA-2026-00001', trainsPerWeek: 3, requestedFrom: new Date('2026-11-01T00:00:00Z') }),
      ],
      capacity: [{ corridorCode: 'COR-ORE', trainsPerWeek: 5 }],
    });
    const p1 = r.proposals.find((p) => p.applicationNumber === 'SA-2026-00001')!;
    const p2 = r.proposals.find((p) => p.applicationNumber === 'SA-2026-00002')!;
    expect(p1.decision).toBe('ALLOCATE'); // 3 fits
    expect(p2.decision).toBe('DEFER');    // 4 does not fit into the remaining 2
    expect(p2.reasons.join(' ')).toContain('capacity is 5 trains/week');
  });

  it('counts already-allocated demand before proposing new work', () => {
    const r = run({
      candidates: [candidate({ id: 'a1', applicationNumber: 'SA-2026-00009', trainsPerWeek: 3 })],
      capacity: [{ corridorCode: 'COR-ORE', trainsPerWeek: 5 }],
      existingAllocations: [{ applicationNumber: 'SA-2025-00001', corridorCode: 'COR-ORE', trainsPerWeek: 4 }],
    });
    expect(r.proposals[0].decision).toBe('DEFER'); // 4 + 3 > 5
    expect(r.utilization[0].allocatedPerWeek).toBe(4);
  });

  it('defers a window wholly inside a planned possession, warns on partial overlap', () => {
    const r = run({
      candidates: [
        candidate({
          id: 'a1', applicationNumber: 'SA-2026-00001',
          requestedFrom: new Date('2026-12-01T00:00:00Z'), requestedUntil: new Date('2026-12-05T00:00:00Z'),
        }),
        candidate({
          id: 'a2', applicationNumber: 'SA-2026-00002',
          requestedFrom: new Date('2026-11-20T00:00:00Z'), requestedUntil: new Date('2026-12-20T00:00:00Z'),
        }),
      ],
      capacity: [{ corridorCode: 'COR-ORE', trainsPerWeek: 5 }],
      possessions: [{
        windowId: 'p1', corridorCode: 'COR-ORE', title: 'De Aar relay replacement',
        startsAt: new Date('2026-11-25T00:00:00Z'), endsAt: new Date('2026-12-10T00:00:00Z'),
      }],
    });
    const p1 = r.proposals.find((p) => p.applicationNumber === 'SA-2026-00001')!;
    const p2 = r.proposals.find((p) => p.applicationNumber === 'SA-2026-00002')!;
    expect(p1.decision).toBe('DEFER');
    expect(p1.reasons.join(' ')).toContain('entirely inside planned possession');
    expect(p2.decision).toBe('ALLOCATE');
    expect(p2.warnings.join(' ')).toContain('partially overlaps');
  });

  it('prefers a compliant envelope-verified request over a first-come unverified one', () => {
    const r = run({
      candidates: [
        candidate({
          id: 'a1', applicationNumber: 'SA-2026-00001', envelopeCheckStatus: 'UNVERIFIED',
          requestedFrom: new Date('2026-11-01T00:00:00Z'),
        }),
        candidate({
          id: 'a2', applicationNumber: 'SA-2026-00002', envelopeCheckStatus: 'COMPATIBLE',
          requestedFrom: new Date('2026-11-05T00:00:00Z'),
        }),
      ],
      capacity: [{ corridorCode: 'COR-ORE', trainsPerWeek: 3 }],
    });
    // a2 needs 2, a1 needs 2 — only one fits. COMPATIBLE wins even though a1 applied first.
    const p1 = r.proposals.find((p) => p.applicationId === 'a1')!;
    const p2 = r.proposals.find((p) => p.applicationId === 'a2')!;
    expect(p2.decision).toBe('ALLOCATE');
    expect(p1.decision).toBe('DEFER');
  });

  it('is deterministic: identical input produces identical output', () => {
    const input = {
      candidates: [
        candidate({ id: 'a3', applicationNumber: 'SA-2026-00003', trainsPerWeek: 1 }),
        candidate({ id: 'a1', applicationNumber: 'SA-2026-00001', trainsPerWeek: 2 }),
        candidate({ id: 'a2', applicationNumber: 'SA-2026-00002', trainsPerWeek: 2 }),
      ],
      capacity: [{ corridorCode: 'COR-ORE', trainsPerWeek: 3 }],
    };
    const first = run(input);
    const second = run(input);
    expect(second).toEqual(first);
  });

  it('flags over-declared corridors in the notes without proposing more work', () => {
    const r = run({
      candidates: [candidate({ id: 'a1', applicationNumber: 'SA-2026-00010', trainsPerWeek: 1 })],
      capacity: [{ corridorCode: 'COR-ORE', trainsPerWeek: 2 }],
      existingAllocations: [{ applicationNumber: 'SA-2025-00009', corridorCode: 'COR-ORE', trainsPerWeek: 5 }],
    });
    expect(r.notes.join(' ')).toContain('over its declared capacity');
    expect(r.proposals[0].decision).toBe('DEFER');
  });
});
