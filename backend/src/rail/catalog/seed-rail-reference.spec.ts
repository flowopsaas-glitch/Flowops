import { FakeTable, snapshot } from '../../../test/support/in-memory-db';
import { seedRailReference } from './seed-rail-reference';
import { CORRIDOR_CATALOG } from './corridors.catalog';
import { ANNEXURE_20B_VERSION, CANCELLATION_CODE_CATALOG, validateCancellationCodeEntry } from './cancellation-codes.catalog';
import * as yardsModule from './yards.catalog';

function make() {
  const corridors = new FakeTable('cor');
  const yards = new FakeTable('yard');
  const codes = new FakeTable('cnx');
  const prisma = { railCorridorNode: corridors, railYardSpec: yards, railCancellationCode: codes } as any;
  return { prisma, corridors, yards, codes };
}

describe('seedRailReference', () => {
  it('--plan reports what would be created and writes NOTHING', async () => {
    const { prisma, corridors, yards } = make();
    const r = await seedRailReference(prisma, { dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(r.tables[0]).toMatchObject({ table: 'rail_corridor_nodes', catalogRows: 6, created: 6, updated: 0 });
    expect(r.tables[1]).toMatchObject({ table: 'rail_yard_specs', catalogRows: 0, created: 0 });
    expect(r.tables[2]).toMatchObject({ table: 'rail_cancellation_codes', catalogRows: 82, created: 82, updated: 0 });
    expect(corridors.create).not.toHaveBeenCalled();
    expect(corridors.update).not.toHaveBeenCalled();
    expect(yards.create).not.toHaveBeenCalled();
    expect(corridors.rows).toHaveLength(0);
  });

  it('--plan writes nothing to the cancellation-code table either', async () => {
    const { prisma, codes } = make();
    await seedRailReference(prisma, { dryRun: true });
    expect(codes.create).not.toHaveBeenCalled();
    expect(codes.update).not.toHaveBeenCalled();
    expect(codes.rows).toHaveLength(0);
  });

  it('--apply creates the six corridors, all SOURCE_PENDING with no invented limits', async () => {
    const { prisma, corridors } = make();
    const r = await seedRailReference(prisma);
    expect(r.tables[0]).toMatchObject({ created: 6, updated: 0, unchanged: 0 });
    expect(corridors.rows).toHaveLength(6);
    for (const row of corridors.rows) {
      expect(row).toMatchObject({ dataStatus: 'SOURCE_PENDING', gauge: null, maxAxleLoadTonnes: null, vehicleProfile: null, maxTrainLengthM: null });
      expect(row.electrification).toEqual([]);
    }
    const ore = corridors.rows.find((c) => c.code === 'COR-ORE')!;
    expect(ore).toMatchObject({ name: 'Ore', aliases: ['Cape 2'], workbookRoutes: ['Ore'], sortOrder: 30 });
  });

  it('is idempotent: a second run changes nothing', async () => {
    const { prisma, corridors } = make();
    await seedRailReference(prisma);
    const before = snapshot(corridors);
    corridors.create.mockClear(); corridors.update.mockClear();
    const r = await seedRailReference(prisma);
    expect(r.tables[0]).toMatchObject({ created: 0, updated: 0, unchanged: 6, skippedVerified: 0 });
    expect(corridors.create).not.toHaveBeenCalled();
    expect(corridors.update).not.toHaveBeenCalled();
    expect(snapshot(corridors)).toBe(before);
  });

  it('refreshes a row whose catalog entry changed', async () => {
    const { prisma, corridors } = make();
    await seedRailReference(prisma);
    corridors.rows.find((c) => c.code === 'COR-CAPE')!.name = 'Cape (stale)';
    const r = await seedRailReference(prisma);
    expect(r.tables[0]).toMatchObject({ updated: 1, unchanged: 5 });
    expect(corridors.rows.find((c) => c.code === 'COR-CAPE')!.name).toBe('Cape');
  });

  it('NEVER downgrades a VERIFIED row to the catalog\'s SOURCE_PENDING — it is skipped and reported', async () => {
    const { prisma, corridors } = make();
    await seedRailReference(prisma);
    const row = corridors.rows.find((c) => c.code === 'COR-ORE')!;
    Object.assign(row, { dataStatus: 'VERIFIED', gauge: 'CAPE_1067MM', maxAxleLoadTonnes: 26, sourceRef: 'loaded by hand' });
    const r = await seedRailReference(prisma);
    expect(r.tables[0]).toMatchObject({ skippedVerified: 1, unchanged: 5, updated: 0 });
    expect(row).toMatchObject({ dataStatus: 'VERIFIED', gauge: 'CAPE_1067MM', maxAxleLoadTonnes: 26, sourceRef: 'loaded by hand' });
  });

  it('is all-or-nothing: an invalid catalog entry aborts before ANY write', async () => {
    const { prisma, corridors } = make();
    const bad = { ...CORRIDOR_CATALOG[0], code: 'cor_bad' };
    const spy = jest.spyOn(CORRIDOR_CATALOG as unknown as any[], 'forEach' as never); void spy;
    // temporarily poison the shared catalog array
    (CORRIDOR_CATALOG as unknown as any[]).push(bad);
    try {
      await expect(seedRailReference(prisma)).rejects.toThrow(/failed validation — nothing was written[\s\S]*corridor cor_bad: code "cor_bad" must be UPPER-KEBAB/);
      expect(corridors.create).not.toHaveBeenCalled();
      expect(corridors.rows).toHaveLength(0);
    } finally {
      (CORRIDOR_CATALOG as unknown as any[]).pop();
      jest.restoreAllMocks();
    }
  });

  it('detects duplicate codes', async () => {
    const { prisma } = make();
    (CORRIDOR_CATALOG as unknown as any[]).push({ ...CORRIDOR_CATALOG[1] });
    try {
      await expect(seedRailReference(prisma)).rejects.toThrow(/duplicate corridor code COR-CAPE/);
    } finally {
      (CORRIDOR_CATALOG as unknown as any[]).pop();
    }
  });

  it('seeds yards once a cited source is added (the catalog is empty today)', async () => {
    const { prisma, yards } = make();
    const entry = {
      code: 'YARD-TEST', name: 'Test yard', corridorCode: 'COR-ORE', isTransferYard: true, gauge: null, electrification: [] as string[],
      maxAxleLoadTonnes: null, vehicleProfile: null, maxTrainLengthM: null, sidingCapacityWagons: null, contacts: [], dataStatus: 'SOURCE_PENDING' as const,
      sourceRef: 'test', verifiedBy: null, notes: '',
    };
    (yardsModule.YARD_CATALOG as unknown as any[]).push(entry);
    try {
      const r = await seedRailReference(prisma);
      expect(r.tables[1]).toMatchObject({ catalogRows: 1, created: 1 });
      expect(yards.rows[0]).toMatchObject({ code: 'YARD-TEST', corridorCode: 'COR-ORE', isTransferYard: true });
    } finally {
      (yardsModule.YARD_CATALOG as unknown as any[]).pop();
    }
  });

  describe('Annexure 20b cancellation codes', () => {
    it('--apply creates all 82 rows, in source order, with the annexure version stamped', async () => {
      const { prisma, codes } = make();
      const r = await seedRailReference(prisma);
      expect(r.tables[2]).toMatchObject({ created: 82, updated: 0, unchanged: 0, skippedVerified: 0, notes: [] });
      expect(codes.rows).toHaveLength(82);
      expect(codes.rows.map((c) => c.code)).toEqual(Array.from({ length: 82 }, (_, i) => `CNX-${String(i + 1).padStart(3, '0')}`));
      expect(codes.rows.every((c) => c.annexureVersion === ANNEXURE_20B_VERSION)).toBe(true);
      expect(codes.rows.filter((c) => c.responsibleParty === 'ALLOCATION_REQUIRED')).toHaveLength(10);
    });

    it('keeps the "Could be …" rows unallocated and lists the parties the annexure names', async () => {
      const { prisma, codes } = make();
      await seedRailReference(prisma);
      expect(codes.rows.find((c) => c.code === 'CNX-002')).toMatchObject({ reason: 'Animal hit by train', responsibleParty: 'FORCE_MAJEURE', possibleParties: [] });
      expect(codes.rows.find((c) => c.code === 'CNX-003')).toMatchObject({
        reason: 'Assets Fire Damage', responsibleParty: 'ALLOCATION_REQUIRED', possibleParties: ['FORCE_MAJEURE', 'INFRASTRUCTURE_MANAGER', 'RAIL_OPERATIONS'],
        sourceText: 'Could be Force Majeure, Infrastructure Manager or Rail Operations',
      });
    });

    it('does not share array references with the catalog (a later edit of a row cannot corrupt the catalog)', async () => {
      const { prisma, codes } = make();
      await seedRailReference(prisma);
      const row = codes.rows.find((c) => c.code === 'CNX-003')!;
      row.possibleParties.push('MUTATED');
      expect(CANCELLATION_CODE_CATALOG.find((c) => c.code === 'CNX-003')!.possibleParties).not.toContain('MUTATED');
    });

    it('is idempotent: a second run changes nothing and reports 82 unchanged', async () => {
      const { prisma, codes } = make();
      await seedRailReference(prisma);
      const before = snapshot(codes);
      codes.create.mockClear(); codes.update.mockClear();
      const r = await seedRailReference(prisma);
      expect(r.tables[2]).toMatchObject({ created: 0, updated: 0, unchanged: 82, notes: [] });
      expect(codes.create).not.toHaveBeenCalled();
      expect(codes.update).not.toHaveBeenCalled();
      expect(snapshot(codes)).toBe(before);
    });

    it('refreshes a row whose wording drifted, without flagging an attribution change', async () => {
      const { prisma, codes } = make();
      await seedRailReference(prisma);
      codes.rows.find((c) => c.code === 'CNX-001')!.reason = 'Abnormal working / yard (stale)';
      const r = await seedRailReference(prisma);
      expect(r.tables[2]).toMatchObject({ updated: 1, unchanged: 81, notes: [] });
      expect(codes.rows.find((c) => c.code === 'CNX-001')!.reason).toBe('Abnormal working / yard');
    });

    it('flags a change of responsible party — in --plan it is reported but nothing is written', async () => {
      const { prisma, codes } = make();
      await seedRailReference(prisma);
      codes.rows.find((c) => c.code === 'CNX-006')!.responsibleParty = 'RAIL_OPERATIONS'; // catalog says INFRASTRUCTURE_MANAGER
      const plan = await seedRailReference(prisma, { dryRun: true });
      expect(plan.tables[2]).toMatchObject({ updated: 1 });
      expect(plan.tables[2].notes).toEqual([expect.stringMatching(/CNX-006 responsible party WOULD change: RAIL_OPERATIONS -> INFRASTRUCTURE_MANAGER/)]);
      expect(codes.rows.find((c) => c.code === 'CNX-006')!.responsibleParty).toBe('RAIL_OPERATIONS');

      const applied = await seedRailReference(prisma);
      expect(applied.tables[2].notes).toEqual([expect.stringMatching(/CNX-006 responsible party changed: RAIL_OPERATIONS -> INFRASTRUCTURE_MANAGER/)]);
      expect(codes.rows.find((c) => c.code === 'CNX-006')!.responsibleParty).toBe('INFRASTRUCTURE_MANAGER');
    });

    it('never revives a code an operator deactivated — even when the row is refreshed', async () => {
      const { prisma, codes } = make();
      await seedRailReference(prisma);
      const row = codes.rows.find((c) => c.code === 'CNX-010')!;
      row.isActive = false;
      row.reason = 'edited by hand';
      const r = await seedRailReference(prisma);
      expect(r.tables[2]).toMatchObject({ updated: 1, unchanged: 81 });
      expect(r.tables[2].notes).toEqual([expect.stringMatching(/CNX-010 is deactivated in the database — its status was left alone/)]);
      expect(row).toMatchObject({ isActive: false, reason: 'Carriage & Wagons related' });
      expect(codes.update.mock.calls.every(([arg]) => !('isActive' in arg.data))).toBe(true);
    });

    it('is all-or-nothing: one invalid code stops the whole seed before ANY table is written', async () => {
      const { prisma, corridors, codes } = make();
      const bad = { code: 'CNX-999', sourceRow: 999, reason: 'Bad', sourceText: 'Could be Force Majeure', responsibleParty: 'ALLOCATION_REQUIRED' as const, possibleParties: ['FORCE_MAJEURE' as const] };
      (CANCELLATION_CODE_CATALOG as unknown as any[]).push(bad);
      try {
        await expect(seedRailReference(prisma)).rejects.toThrow(/failed validation — nothing was written[\s\S]*cancellation code CNX-999: an ALLOCATION_REQUIRED row must list the parties/);
        expect(corridors.create).not.toHaveBeenCalled();
        expect(codes.create).not.toHaveBeenCalled();
        expect(codes.rows).toHaveLength(0);
      } finally {
        (CANCELLATION_CODE_CATALOG as unknown as any[]).pop();
      }
    });

    it('detects a duplicated code or source row', async () => {
      const { prisma } = make();
      (CANCELLATION_CODE_CATALOG as unknown as any[]).push({ ...CANCELLATION_CODE_CATALOG[0] });
      try {
        await expect(seedRailReference(prisma)).rejects.toThrow(/duplicate cancellation code CNX-001[\s\S]*duplicate cancellation sourceRow 1/);
      } finally {
        (CANCELLATION_CODE_CATALOG as unknown as any[]).pop();
      }
    });
  });
});

describe('validateCancellationCodeEntry', () => {
  const ok = CANCELLATION_CODE_CATALOG[0];
  it('accepts every one of the 82 catalog rows', () => {
    const bad = CANCELLATION_CODE_CATALOG.flatMap((c) => validateCancellationCodeEntry(c).map((p) => `${c.code}: ${p}`));
    expect(bad).toEqual([]);
  });
  it.each([
    [{ code: 'CNX-1' }, /must look like CNX-001/],
    [{ code: 'CNX-005' }, /does not match sourceRow 1/],
    [{ sourceRow: 0 }, /sourceRow must be a positive integer/],
    [{ reason: '  ' }, /reason is required/],
    [{ sourceText: '' }, /sourceText is required/],
    [{ responsibleParty: 'TRIM' as any }, /responsibleParty "TRIM" is not one of/],
    [{ possibleParties: ['FORCE_MAJEURE' as const] }, /only an ALLOCATION_REQUIRED row can list possibleParties/],
    [{ responsibleParty: 'ALLOCATION_REQUIRED' as const, possibleParties: [] }, /at least two/],
    [{ responsibleParty: 'ALLOCATION_REQUIRED' as const, possibleParties: ['FORCE_MAJEURE' as const, 'ALLOCATION_REQUIRED' as any] }, /may only name RAIL_OPERATIONS/],
  ])('rejects %j', (patch, re) => {
    expect(validateCancellationCodeEntry({ ...ok, ...patch })).toEqual(expect.arrayContaining([expect.stringMatching(re)]));
  });
});
