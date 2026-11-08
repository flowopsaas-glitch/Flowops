/**
 * Where the schedule optimizer gets its capacity from.
 *
 * The optimizer allocates against the corridor-capacity LEDGER. It must not take capacity
 * from the request body: capacity is a sourced, auditable statement (Annexure 33b, a
 * workbook, an IM confirmation), and a number supplied by the browser is none of those —
 * accepting it lets an allocation be justified by a figure nobody can cite.
 *
 * Prisma is an in-memory fake (backend/test/support).
 */
import { ForbiddenException } from '@nestjs/common';
import { RailCapacityUnit } from '@prisma/client';
import { FakeTable } from '../../test/support/in-memory-db';
import { RailOptimizerService } from './rail-optimizer.service';

const DAY = 86_400_000;
const NOW = new Date('2026-10-02T10:00:00.000Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

const COMPANY = 'co-1';

function make(opts: { entitled?: boolean } = {}) {
  const apps = new FakeTable('sa');
  const docs = new FakeTable('doc');
  const possessions = new FakeTable('pos');
  const capacity = new FakeTable('cap');

  const prisma = {
    railSlotApplication: apps,
    railOperatorComplianceDoc: docs,
    railPossessionWindow: possessions,
    railCorridorCapacity: capacity,
  };
  const billing = { hasFeature: jest.fn().mockResolvedValue(opts.entitled ?? true) };
  const slots = {} as any;

  // Compliance is evaluated BEFORE capacity, so an operator with no documents is deferred
  // for compliance and never reaches the capacity constraint. Seed the four documents a
  // SUBMIT-stage application needs so that capacity is the only variable under test.
  for (const docType of ['RSR_PERMIT', 'INSURANCE', 'ROLLING_STOCK_CERT', 'TRAIN_CREW_CERT']) {
    docs.seed({ companyId: COMPANY, docType, status: 'VALID', validFrom: at(-90), validUntil: at(275) } as any);
  }

  const svc = new RailOptimizerService(prisma as any, billing as any, slots);
  return { svc, apps, docs, capacity, billing };
}

/** An application that is otherwise perfectly allocatable, so capacity is the only variable. */
function seedApplication(apps: FakeTable, over: Partial<Record<string, unknown>> = {}) {
  return apps.seed({
    id: 'app-1',
    companyId: COMPANY,
    applicationNumber: 'RSA-0001',
    corridorCode: 'COR-ORE',
    status: 'SUBMITTED',
    requestedFrom: at(10),
    requestedUntil: at(40),
    trainsPerWeek: 4,
    envelopeCheckStatus: 'COMPATIBLE',
    isDangerousGoods: false,
    ...over,
  } as any);
}

function seedCapacity(capacity: FakeTable, over: Partial<Record<string, unknown>> = {}) {
  return capacity.seed({
    id: 'cap-1',
    companyId: COMPANY,
    corridorCode: 'COR-ORE',
    validFrom: at(-30),
    validUntil: at(60),
    theoreticalPathsPerDay: 20,
    capacityFactor: 0.65,
    practicalPathsPerDay: 8,
    unit: RailCapacityUnit.PATHS_PER_DAY,
    dataStatus: 'SOURCED',
    sourceRef: 'Annexure 33b Capacity_DB FY2026/27',
    ...over,
  } as any);
}

const utilizationFor = (result: any, corridorCode: string) =>
  result.utilization.find((u: any) => u.corridorCode === corridorCode);

describe('RailOptimizerService capacity resolution', () => {
  it('uses the ledger statement, not a caller-supplied figure', async () => {
    const { svc, apps, capacity } = make();
    seedApplication(apps);
    seedCapacity(capacity, { practicalPathsPerDay: 8 }); // 8 paths/day -> 56/week

    // The caller claims an enormous capacity; the ledger says 56/week. The ledger wins.
    const result = await svc.run(COMPANY, { capacity: [{ corridorCode: 'COR-ORE', trainsPerWeek: 999 }] } as any, NOW);

    expect(utilizationFor(result, 'COR-ORE').capacityPerWeek).toBe(56);
  });

  it('converts PATHS_PER_DAY to trains per week at seven days', async () => {
    const { svc, apps, capacity } = make();
    seedApplication(apps);
    seedCapacity(capacity, { practicalPathsPerDay: 5, unit: RailCapacityUnit.PATHS_PER_DAY });

    const result = await svc.run(COMPANY, {} as any, NOW);

    expect(utilizationFor(result, 'COR-ORE').capacityPerWeek).toBe(35);
  });

  it('takes TRAINS_PER_WEEK statements at face value without scaling', async () => {
    const { svc, apps, capacity } = make();
    seedApplication(apps);
    seedCapacity(capacity, { practicalPathsPerDay: 12, unit: RailCapacityUnit.TRAINS_PER_WEEK });

    const result = await svc.run(COMPANY, {} as any, NOW);

    expect(utilizationFor(result, 'COR-ORE').capacityPerWeek).toBe(12);
  });

  it('rounds down so it never claims more capacity than the statement supports', async () => {
    const { svc, apps, capacity } = make();
    seedApplication(apps);
    seedCapacity(capacity, { practicalPathsPerDay: 8.45, unit: RailCapacityUnit.PATHS_PER_DAY }); // 59.15

    const result = await svc.run(COMPANY, {} as any, NOW);

    expect(utilizationFor(result, 'COR-ORE').capacityPerWeek).toBe(59);
  });

  it('falls back to a caller-supplied figure only where the ledger has no statement', async () => {
    const { svc, apps, capacity } = make();
    seedApplication(apps, { corridorCode: 'COR-ORE' });
    seedApplication(apps, { id: 'app-2', applicationNumber: 'RSA-0002', corridorCode: 'COR-COAL' });
    seedCapacity(capacity, { corridorCode: 'COR-ORE', practicalPathsPerDay: 8 }); // 56/week

    const result = await svc.run(
      COMPANY,
      { capacity: [{ corridorCode: 'COR-COAL', trainsPerWeek: 10 }] } as any,
      NOW,
    );

    expect(utilizationFor(result, 'COR-ORE').capacityPerWeek).toBe(56); // ledger
    expect(utilizationFor(result, 'COR-COAL').capacityPerWeek).toBe(10); // fallback
  });

  it('ignores a statement that is not in force on the run date', async () => {
    const { svc, apps, capacity } = make();
    seedApplication(apps);
    seedCapacity(capacity, { validFrom: at(30), validUntil: at(90) }); // starts after the run

    const result = await svc.run(COMPANY, {} as any, NOW);

    expect(utilizationFor(result, 'COR-ORE').capacityPerWeek).toBeNull();
    const proposal = result.proposals.find((p: any) => p.applicationId === 'app-1');
    expect(proposal.decision).toBe('DEFER');
    expect(proposal.reasons.join(' ')).toMatch(/No weekly capacity has been declared/);
  });

  it('ignores an expired statement', async () => {
    const { svc, apps, capacity } = make();
    seedApplication(apps);
    seedCapacity(capacity, { validFrom: at(-120), validUntil: at(-30) }); // ended before the run

    const result = await svc.run(COMPANY, {} as any, NOW);

    expect(utilizationFor(result, 'COR-ORE').capacityPerWeek).toBeNull();
  });

  it('prefers the later statement when periods overlap', async () => {
    const { svc, apps, capacity } = make();
    seedApplication(apps);
    seedCapacity(capacity, { id: 'cap-old', validFrom: at(-60), practicalPathsPerDay: 4 }); // 28/week
    seedCapacity(capacity, { id: 'cap-new', validFrom: at(-10), practicalPathsPerDay: 9 }); // 63/week

    const result = await svc.run(COMPANY, {} as any, NOW);

    expect(utilizationFor(result, 'COR-ORE').capacityPerWeek).toBe(63);
  });

  it('defers rather than allocates when nothing declares capacity for the corridor', async () => {
    const { svc, apps } = make();
    seedApplication(apps);

    const result = await svc.run(COMPANY, {} as any, NOW);

    const proposal = result.proposals.find((p: any) => p.applicationId === 'app-1');
    expect(proposal.decision).toBe('DEFER');
    expect(utilizationFor(result, 'COR-ORE').capacityPerWeek).toBeNull();
  });

  it('allocates within the ledger capacity and defers the excess', async () => {
    const { svc, apps, capacity } = make();
    seedCapacity(capacity, { practicalPathsPerDay: 1, unit: RailCapacityUnit.TRAINS_PER_WEEK }); // 1/week
    seedApplication(apps, { id: 'app-1', applicationNumber: 'RSA-0001', trainsPerWeek: 1 });
    seedApplication(apps, { id: 'app-2', applicationNumber: 'RSA-0002', trainsPerWeek: 1 });

    const result = await svc.run(COMPANY, {} as any, NOW);

    const decisions = result.proposals.map((p: any) => p.decision).sort();
    expect(decisions).toEqual(['ALLOCATE', 'DEFER']);
  });

  it('refuses to run for a tenant without the rail entitlement', async () => {
    const { svc } = make({ entitled: false });

    await expect(svc.run(COMPANY, {} as any, NOW)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
