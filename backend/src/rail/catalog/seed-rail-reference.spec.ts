import { FakeTable, snapshot } from '../../../test/support/in-memory-db';
import { seedRailReference } from './seed-rail-reference';
import { CORRIDOR_CATALOG } from './corridors.catalog';
import * as yardsModule from './yards.catalog';

function make() {
  const corridors = new FakeTable('cor');
  const yards = new FakeTable('yard');
  const prisma = { railCorridorNode: corridors, railYardSpec: yards } as any;
  return { prisma, corridors, yards };
}

describe('seedRailReference', () => {
  it('--plan reports what would be created and writes NOTHING', async () => {
    const { prisma, corridors, yards } = make();
    const r = await seedRailReference(prisma, { dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(r.tables[0]).toMatchObject({ table: 'rail_corridor_nodes', catalogRows: 6, created: 6, updated: 0 });
    expect(r.tables[1]).toMatchObject({ table: 'rail_yard_specs', catalogRows: 0, created: 0 });
    expect(corridors.create).not.toHaveBeenCalled();
    expect(corridors.update).not.toHaveBeenCalled();
    expect(yards.create).not.toHaveBeenCalled();
    expect(corridors.rows).toHaveLength(0);
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
});
