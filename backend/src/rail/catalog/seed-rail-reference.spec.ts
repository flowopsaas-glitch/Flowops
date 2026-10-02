import { FakeTable, snapshot } from '../../../test/support/in-memory-db';
import { seedRailReference } from './seed-rail-reference';
import { CORRIDOR_CATALOG } from './corridors.catalog';
import { ANNEXURE_20B_VERSION, CANCELLATION_CODE_CATALOG, validateCancellationCodeEntry } from './cancellation-codes.catalog';
import * as yardsModule from './yards.catalog';
import { ANCILLARY_SERVICE_CATALOG, ANNEXURE_40_VERSION, AncillaryServiceLine, validateAncillaryServiceEntry } from './ancillary-services.catalog';
import { TARIFF_SCHEDULE_CATALOG, TariffScheduleEntry, validateTariffScheduleEntry } from './tariff-schedules.catalog';

function make() {
  const corridors = new FakeTable('cor');
  const yards = new FakeTable('yard');
  const codes = new FakeTable('cnx');
  // `defaults` mimic the database: an unset nullable column reads back as NULL, and isActive defaults to true.
  const ancillary = new FakeTable('anc', { defaults: () => ({ isActive: true, unitRateZar: null, rateSourceRef: null }) });
  const schedules = new FakeTable('tar', { defaults: () => ({ isActive: true }) });
  const prisma = { railCorridorNode: corridors, railYardSpec: yards, railCancellationCode: codes, railAncillaryServiceCatalog: ancillary, railTariffSchedule: schedules } as any;
  return { prisma, corridors, yards, codes, ancillary, schedules };
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

describe('Annexure 40 ancillary services (113 lines, NO prices)', () => {
  it('the real catalog validates, with 113 unique lines and not one price', () => {
    expect(ANCILLARY_SERVICE_CATALOG).toHaveLength(113);
    expect(ANCILLARY_SERVICE_CATALOG.flatMap(validateAncillaryServiceEntry)).toEqual([]);
    expect(new Set(ANCILLARY_SERVICE_CATALOG.map((a) => a.code)).size).toBe(113);
    for (const a of ANCILLARY_SERVICE_CATALOG) {
      expect(a.unitRateZar).toBeUndefined();
      expect(a.rateSourceRef).toBeUndefined();
      expect(['NOT_PUBLISHED', 'TBD']).toContain(a.priceStatus);
    }
  });

  it('--plan reports 113 to create and writes nothing', async () => {
    const { prisma, ancillary } = make();
    const r = await seedRailReference(prisma, { dryRun: true });
    expect(r.tables[3]).toMatchObject({ table: 'rail_ancillary_services', catalogRows: 113, created: 113, updated: 0, unchanged: 0, skippedVerified: 0, notes: [] });
    expect(ancillary.create).not.toHaveBeenCalled();
    expect(ancillary.rows).toHaveLength(0);
  });

  it('--apply creates all 113 lines unpriced: no rate, no source, TBD preserved as TBD', async () => {
    const { prisma, ancillary } = make();
    const r = await seedRailReference(prisma);
    expect(r.tables[3]).toMatchObject({ created: 113, updated: 0 });
    expect(ancillary.rows).toHaveLength(113);
    expect(ancillary.rows.every((a) => a.unitRateZar === null && a.rateSourceRef === null)).toBe(true);
    expect(ancillary.rows.every((a) => a.annexureVersion === ANNEXURE_40_VERSION && a.annexureVersion === '2026/27')).toBe(true);
    expect(ancillary.rows.filter((a) => a.priceStatus === 'TBD')).toHaveLength(8);
    expect(ancillary.rows.filter((a) => a.priceStatus === 'NOT_PUBLISHED')).toHaveLength(105);
    expect([1, 2, 3, 4].map((t) => ancillary.rows.filter((a) => a.tier === t).length)).toEqual([7, 4, 17, 85]);
    expect(new Set(ancillary.rows.map((a) => a.serviceNumber)).size).toBe(40);
    expect(ancillary.rows.every((a) => ['RAIL', 'TELECOMS', 'SAFETY_EMERGENCY', 'PROPERTY'].includes(a.serviceGroup))).toBe(true);
    expect(ancillary.rows.find((a) => a.code === 'ANX40-01')).toMatchObject({ serviceNumber: 1, tier: 1, isCompulsory: true });
  });

  it('is idempotent', async () => {
    const { prisma, ancillary } = make();
    await seedRailReference(prisma);
    const before = snapshot(ancillary);
    ancillary.create.mockClear(); ancillary.update.mockClear();
    const r = await seedRailReference(prisma);
    expect(r.tables[3]).toMatchObject({ created: 0, updated: 0, unchanged: 113, skippedVerified: 0, notes: [] });
    expect(ancillary.create).not.toHaveBeenCalled();
    expect(ancillary.update).not.toHaveBeenCalled();
    expect(snapshot(ancillary)).toBe(before);
  });

  it('refreshes a line whose wording changed', async () => {
    const { prisma, ancillary } = make();
    await seedRailReference(prisma);
    const row = ancillary.rows.find((a) => a.code === 'ANX40-01')!;
    row.unitOfMeasure = 'stale';
    const r = await seedRailReference(prisma);
    expect(r.tables[3]).toMatchObject({ updated: 1, unchanged: 112 });
    expect(row.unitOfMeasure).not.toBe('stale');
  });

  it('isActive is the OPERATOR\'s: never written on update, and a deactivated line is reported, not revived', async () => {
    const { prisma, ancillary } = make();
    await seedRailReference(prisma);
    const row = ancillary.rows.find((a) => a.code === 'ANX40-02')!;
    row.isActive = false;
    row.name = 'stale name';
    const r = await seedRailReference(prisma);
    expect(row.isActive).toBe(false);
    expect(row.name).not.toBe('stale name'); // other fields were refreshed
    expect(r.tables[3].notes).toContain('ANX40-02 is deactivated in the database — its status was left alone.');
    expect((ancillary.update.mock.calls.at(-1)![0] as any).data).not.toHaveProperty('isActive');
  });

  it('NEVER overwrites a PUBLISHED rate with a catalog line that carries none — the row is skipped and reported', async () => {
    const { prisma, ancillary } = make();
    await seedRailReference(prisma);
    const row = ancillary.rows.find((a) => a.code === 'ANX40-03')!;
    Object.assign(row, { priceStatus: 'PUBLISHED', unitRateZar: 42.5, rateSourceRef: 'Tariff book 2026/27 p.12' });
    ancillary.update.mockClear();
    const r = await seedRailReference(prisma);
    expect(r.tables[3]).toMatchObject({ skippedVerified: 1, unchanged: 112, updated: 0 });
    expect(r.tables[3].notes).toContain('ANX40-03 has a PUBLISHED rate in the database (R42.5) and the catalog carries none — the row was left alone.');
    expect(row).toMatchObject({ priceStatus: 'PUBLISHED', unitRateZar: 42.5, rateSourceRef: 'Tariff book 2026/27 p.12' });
    expect(ancillary.update).not.toHaveBeenCalled();
  });

  it('every change to a rate is listed — "WOULD change" under --plan, "changed" under --apply', async () => {
    const { prisma, ancillary } = make();
    await seedRailReference(prisma);
    const row = ancillary.rows.find((a) => a.code === 'ANX40-04-01')!;
    Object.assign(row, { unitRateZar: 9.99 }); // a stray hand-edit on a line that is still TBD / not published
    const plan = await seedRailReference(prisma, { dryRun: true });
    expect(plan.tables[3].notes).toContain('ANX40-04-01 rate WOULD change: 9.99 -> none (this is the price billed for the service).');
    expect(row.unitRateZar).toBe(9.99); // a plan writes nothing
    const applied = await seedRailReference(prisma);
    expect(applied.tables[3].notes).toContain('ANX40-04-01 rate changed: 9.99 -> none (this is the price billed for the service).');
    expect(row.unitRateZar).toBeNull();
  });

  it('seeds a PUBLISHED line WITH its rate and source once the catalog carries them', async () => {
    const { prisma, ancillary } = make();
    const entry: AncillaryServiceLine = {
      ...ANCILLARY_SERVICE_CATALOG[0], code: 'ANX40-01-99', name: 'Test priced line', priceStatus: 'PUBLISHED', unitRateZar: 18.25, rateSourceRef: 'Tariff book 2026/27 p.3',
    };
    (ANCILLARY_SERVICE_CATALOG as unknown as any[]).push(entry);
    try {
      expect(validateAncillaryServiceEntry(entry)).toEqual([]);
      const r = await seedRailReference(prisma);
      expect(r.tables[3]).toMatchObject({ catalogRows: 114, created: 114 });
      expect(ancillary.rows.find((a) => a.code === 'ANX40-01-99')).toMatchObject({ priceStatus: 'PUBLISHED', unitRateZar: 18.25, rateSourceRef: 'Tariff book 2026/27 p.3' });
    } finally {
      (ANCILLARY_SERVICE_CATALOG as unknown as any[]).pop();
    }
  });

  it('is all-or-nothing: a PUBLISHED line without a source aborts before ANY write, in every table', async () => {
    const { prisma, ancillary, corridors, codes } = make();
    (ANCILLARY_SERVICE_CATALOG as unknown as any[]).push({ ...ANCILLARY_SERVICE_CATALOG[0], code: 'ANX40-01-98', priceStatus: 'PUBLISHED', unitRateZar: 5 });
    try {
      await expect(seedRailReference(prisma)).rejects.toThrow(/nothing was written[\s\S]*ancillary service ANX40-01-98: a PUBLISHED line needs rateSourceRef/);
      expect(ancillary.rows).toHaveLength(0);
      expect(corridors.rows).toHaveLength(0);
      expect(codes.rows).toHaveLength(0);
    } finally {
      (ANCILLARY_SERVICE_CATALOG as unknown as any[]).pop();
    }
  });

  it('detects a duplicate line code', async () => {
    const { prisma } = make();
    (ANCILLARY_SERVICE_CATALOG as unknown as any[]).push({ ...ANCILLARY_SERVICE_CATALOG[3] });
    try {
      await expect(seedRailReference(prisma)).rejects.toThrow(/duplicate ancillary service code/);
    } finally {
      (ANCILLARY_SERVICE_CATALOG as unknown as any[]).pop();
    }
  });
});

describe('validateAncillaryServiceEntry', () => {
  const ok: AncillaryServiceLine = { ...ANCILLARY_SERVICE_CATALOG[0] };
  it.each([
    ['a malformed code', { code: 'ANX-1' }, /must look like ANX40-04/],
    ['a code that disagrees with its service number', { code: 'ANX40-05', serviceNumber: 1 }, /does not match serviceNumber/],
    ['a service number out of range', { serviceNumber: 41, code: 'ANX40-41' }, /serviceNumber must be 1-40/],
    ['no unit of measure', { unitOfMeasure: '  ' }, /unitOfMeasure is required/],
    ['a tier out of range', { tier: 5 as never }, /tier must be 1-4/],
    ['an unknown group', { group: 'SPACE' as never }, /group "SPACE"/],
    ['an unknown price status', { priceStatus: 'FREE' as never }, /priceStatus "FREE"/],
    ['TBD carrying a rate (TBD is not zero and not a price)', { priceStatus: 'TBD' as const, unitRateZar: 0 }, /TBD line must not carry a unitRateZar/],
    ['NOT_PUBLISHED carrying a source', { priceStatus: 'NOT_PUBLISHED' as const, rateSourceRef: 'x' }, /must not carry a rateSourceRef/],
    ['PUBLISHED without a rate', { priceStatus: 'PUBLISHED' as const, rateSourceRef: 'Tariff book' }, /needs a finite, non-negative unitRateZar/],
    ['PUBLISHED with a negative rate', { priceStatus: 'PUBLISHED' as const, unitRateZar: -1, rateSourceRef: 'Tariff book' }, /needs a finite, non-negative unitRateZar/],
    ['PUBLISHED with a NaN rate', { priceStatus: 'PUBLISHED' as const, unitRateZar: NaN, rateSourceRef: 'Tariff book' }, /needs a finite, non-negative unitRateZar/],
    ['PUBLISHED without a source', { priceStatus: 'PUBLISHED' as const, unitRateZar: 5 }, /needs rateSourceRef/],
  ])('rejects %s', (_l, over, msg) => {
    expect(validateAncillaryServiceEntry({ ...ok, ...over }).join(' ')).toMatch(msg);
  });
  it('accepts a PUBLISHED line that has both a rate and its source (a rate of zero is allowed when published)', () => {
    expect(validateAncillaryServiceEntry({ ...ok, priceStatus: 'PUBLISHED', unitRateZar: 0, rateSourceRef: 'Tariff book' })).toEqual([]);
  });
});

describe('tariff schedules (the catalogue is EMPTY: no c/GTK rate was supplied)', () => {
  const entry = (over: Partial<TariffScheduleEntry> = {}): TariffScheduleEntry => ({
    corridorCode: 'COR-ORE', financialYear: '2026/27', loadedCentsPerGtk: 5, emptyCentsPerGtk: 2, dataStatus: 'VERIFIED', sourceRef: 'SYNTHETIC test tariff', ...over,
  });
  const withCatalog = async (entries: TariffScheduleEntry[], fn: () => Promise<void>) => {
    (TARIFF_SCHEDULE_CATALOG as unknown as any[]).push(...entries);
    try { await fn(); } finally { (TARIFF_SCHEDULE_CATALOG as unknown as any[]).length = 0; }
  };

  it('there is no rate in the shipped catalogue — loading one is a deliberate, reviewed change to this assertion', () => {
    expect(TARIFF_SCHEDULE_CATALOG).toEqual([]);
  });

  it('so the seeder creates no tariff row at all', async () => {
    const { prisma, schedules } = make();
    const r = await seedRailReference(prisma);
    expect(r.tables[4]).toMatchObject({ table: 'rail_tariff_schedules', catalogRows: 0, created: 0, updated: 0, unchanged: 0, skippedVerified: 0, notes: [] });
    expect(schedules.rows).toHaveLength(0);
    expect(schedules.create).not.toHaveBeenCalled();
  });

  it('the summary lists all five tables, in order', async () => {
    const { prisma } = make();
    expect((await seedRailReference(prisma, { dryRun: true })).tables.map((t) => t.table)).toEqual([
      'rail_corridor_nodes', 'rail_yard_specs', 'rail_cancellation_codes', 'rail_ancillary_services', 'rail_tariff_schedules',
    ]);
  });

  describe('validateTariffScheduleEntry', () => {
    const corridors = ['COR-ORE', 'COR-COAL'];
    it('accepts a VERIFIED entry with a source and a loaded rate, and a partial SOURCE_PENDING one', () => {
      expect(validateTariffScheduleEntry(entry(), corridors)).toEqual([]);
      expect(validateTariffScheduleEntry({ corridorCode: 'COR-COAL', financialYear: '2027/28', dataStatus: 'SOURCE_PENDING' }, corridors)).toEqual([]);
    });
    it.each([
      ['an unknown corridor', { corridorCode: 'COR-MARS' }, /not a catalogue corridor/],
      ['a malformed year', { financialYear: '2026-27' }, /must look like 2026\/27/],
      ['a year whose second half does not follow', { financialYear: '2026/28' }, /must look like 2026\/27/],
      ['a zero rate', { loadedCentsPerGtk: 0 }, /loadedCentsPerGtk must be a positive, finite number/],
      ['a negative rate', { emptyCentsPerGtk: -1 }, /emptyCentsPerGtk must be a positive, finite number/],
      ['a NaN rate', { dieselPricePerLitreZar: NaN }, /dieselPricePerLitreZar must be a positive, finite number/],
      ['an infinite rate', { overloadPenaltyPerTonneZar: Infinity }, /overloadPenaltyPerTonneZar must be a positive, finite number/],
      ['an unknown status', { dataStatus: 'APPROVED' as never }, /dataStatus "APPROVED"/],
      ['VERIFIED without a source', { sourceRef: undefined }, /VERIFIED schedule needs sourceRef/],
      ['VERIFIED with a blank source', { sourceRef: '  ' }, /VERIFIED schedule needs sourceRef/],
      ['VERIFIED without a loaded rate', { loadedCentsPerGtk: undefined }, /VERIFIED schedule needs a loadedCentsPerGtk/],
    ])('rejects %s', (_l, over, msg) => {
      expect(validateTariffScheduleEntry(entry(over), corridors).join(' ')).toMatch(msg);
    });
  });

  it('seeds a valid entry, then leaves it alone on a second run', async () => {
    const { prisma, schedules } = make();
    await withCatalog([entry()], async () => {
      const first = await seedRailReference(prisma);
      expect(first.tables[4]).toMatchObject({ catalogRows: 1, created: 1 });
      expect(schedules.rows[0]).toMatchObject({ corridorCode: 'COR-ORE', financialYear: '2026/27', loadedCentsPerGtk: 5, emptyCentsPerGtk: 2, dieselLitresPer1000Gtk: null, dataStatus: 'VERIFIED', sourceRef: 'SYNTHETIC test tariff' });
      const second = await seedRailReference(prisma);
      expect(second.tables[4]).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
    });
  });

  it('lists every change to a rate before it is applied', async () => {
    const { prisma, schedules } = make();
    await withCatalog([entry()], async () => {
      await seedRailReference(prisma);
      (TARIFF_SCHEDULE_CATALOG as unknown as any[])[0] = entry({ loadedCentsPerGtk: 5.5, emptyCentsPerGtk: undefined });
      const plan = await seedRailReference(prisma, { dryRun: true });
      expect(plan.tables[4]).toMatchObject({ updated: 1 });
      expect(plan.tables[4].notes).toEqual([
        'COR-ORE 2026/27 loadedCentsPerGtk WOULD change: 5 -> 5.5 (this is a billed rate).',
        'COR-ORE 2026/27 emptyCentsPerGtk WOULD change: 2 -> none (this is a billed rate).',
      ]);
      expect(schedules.rows[0].loadedCentsPerGtk).toBe(5); // plan wrote nothing
      const applied = await seedRailReference(prisma);
      expect(applied.tables[4].notes![0]).toBe('COR-ORE 2026/27 loadedCentsPerGtk changed: 5 -> 5.5 (this is a billed rate).');
      expect(schedules.rows[0]).toMatchObject({ loadedCentsPerGtk: 5.5, emptyCentsPerGtk: null });
    });
  });

  it('NEVER downgrades a VERIFIED row to SOURCE_PENDING', async () => {
    const { prisma, schedules } = make();
    await withCatalog([entry()], async () => {
      await seedRailReference(prisma);
      (TARIFF_SCHEDULE_CATALOG as unknown as any[])[0] = entry({ dataStatus: 'SOURCE_PENDING', sourceRef: undefined, loadedCentsPerGtk: 9 });
      const r = await seedRailReference(prisma);
      expect(r.tables[4]).toMatchObject({ skippedVerified: 1, updated: 0 });
      expect(r.tables[4].notes).toContain('COR-ORE 2026/27 is VERIFIED in the database and the catalog says SOURCE_PENDING — the row was left alone.');
      expect(schedules.rows[0]).toMatchObject({ dataStatus: 'VERIFIED', loadedCentsPerGtk: 5 });
    });
  });

  it('never writes isActive, and reports a row an operator deactivated', async () => {
    const { prisma, schedules } = make();
    await withCatalog([entry()], async () => {
      await seedRailReference(prisma);
      schedules.rows[0].isActive = false;
      (TARIFF_SCHEDULE_CATALOG as unknown as any[])[0] = entry({ notes: 'refreshed' });
      const r = await seedRailReference(prisma);
      expect(schedules.rows[0]).toMatchObject({ isActive: false, notes: 'refreshed' });
      expect(r.tables[4].notes).toContain('COR-ORE 2026/27 is deactivated in the database — its status was left alone.');
    });
  });

  it('is all-or-nothing: an invalid entry aborts before ANY write, and a duplicate is detected', async () => {
    const { prisma, schedules, corridors, ancillary } = make();
    await withCatalog([entry({ sourceRef: undefined })], async () => {
      await expect(seedRailReference(prisma)).rejects.toThrow(/nothing was written[\s\S]*tariff schedule COR-ORE 2026\/27: a VERIFIED schedule needs sourceRef/);
      expect(schedules.rows).toHaveLength(0);
      expect(corridors.rows).toHaveLength(0);
      expect(ancillary.rows).toHaveLength(0);
    });
    await withCatalog([entry(), entry()], async () => {
      await expect(seedRailReference(prisma)).rejects.toThrow(/duplicate tariff schedule COR-ORE 2026\/27/);
    });
  });
});
