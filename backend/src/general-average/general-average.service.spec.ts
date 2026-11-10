import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  FreightMode,
  GeneralAverageSecurity,
  GeneralAverageStatus,
  GeneralAverageValueBasis,
} from '@prisma/client';
import { GeneralAverageService } from './general-average.service';
import { PrismaService } from '../prisma/prisma.service';

const TENANT = 'tenant-a';
const OTHER = 'tenant-b';

type Row = Record<string, any>;

/** Matches the narrow `where` shapes this service builds, including `{ in: [] }`. */
function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if (k === 'OR') {
      const ors = v as Row[];
      if (Array.isArray(ors) && !ors.some((o) => matches(row, o))) return false;
      continue;
    }
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      if (Array.isArray((v as any).in) && !(v as any).in.includes(row[k])) return false;
      continue;
    }
    if (row[k] !== v) return false;
  }
  return true;
}

/**
 * A small in-memory stand-in for Prisma. Canned stubs would only prove that the
 * service calls *something*; this runs the real arithmetic — share allocation,
 * the release gate, the award true-up — against real rows.
 *
 * The model delegates are only reachable through `withTenant`, so any bare
 * `this.prisma.<model>` call in the service would throw here rather than pass.
 */
class FakePrisma {
  events: Row[] = [];
  contributors: Row[] = [];
  files: Row[] = [];
  calls: string[] = [];
  seq = 0;

  withTenant = jest.fn(async (companyId: string, fn: (tx: any) => any) => {
    this.calls.push(`withTenant:${companyId}`);
    return fn(this.tx());
  });

  private tx() {
    // Arrow functions capture `this`, so no alias is needed.
    const log = (m: string) => this.calls.push(m);
    const nextId = () => `gen-${++this.seq}`;

    const delegate = (name: string, store: Row[]) => ({
      async findFirst({ where }: any = {}) {
        log(`${name}.findFirst`);
        return store.find((r) => matches(r, where)) ?? null;
      },
      async findMany({ where }: any = {}) {
        log(`${name}.findMany`);
        return store.filter((r) => matches(r, where)).map((r) => ({ ...r }));
      },
      async create({ data }: any) {
        log(`${name}.create`);
        const row = { id: nextId(), ...data };
        store.push(row);
        return { ...row };
      },
      async update({ where, data }: any) {
        log(`${name}.update`);
        const row = store.find((r) => matches(r, where));
        if (!row) throw new Error(`${name} not found`);
        Object.assign(row, data);
        return { ...row };
      },
      async updateMany({ where, data }: any) {
        log(`${name}.updateMany`);
        const hit = store.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
    });

    return {
      generalAverageEvent: delegate('generalAverageEvent', this.events),
      generalAverageContributor: delegate('generalAverageContributor', this.contributors),
      shipmentFile: delegate('shipmentFile', this.files),
    };
  }
}

const ev = (over: Partial<Row> = {}): Row => ({
  id: 'ev-1',
  companyId: TENANT,
  vesselName: 'MV Test',
  nature: 'engine room fire',
  occurredAt: new Date('2026-01-01'),
  voyageNumber: 'V1',
  vesselImo: 'IMO1',
  status: GeneralAverageStatus.DECLARED,
  totalExpenditure: 0,
  totalSacrifice: 0,
  ...over,
});

const contrib = (over: Partial<Row> = {}): Row => ({
  id: 'c-1',
  eventId: 'ev-1',
  companyId: TENANT,
  shipmentFileId: 'sf-1',
  contributoryValue: 1000,
  adjustedValue: null,
  valueBasis: GeneralAverageValueBasis.DECLARED,
  securityType: null,
  securityAmount: null,
  securityLodgedAt: null,
  releasedAt: null,
  releasedBy: null,
  assessedContribution: null,
  balanceDue: null,
  settledAt: null,
  sharePct: null,
  estimatedContribution: null,
  ...over,
});

const oceanFile = (over: Partial<Row> = {}): Row => ({
  id: 'sf-1',
  companyId: TENANT,
  mode: FreightMode.OCEAN,
  vesselVoyage: 'V1',
  vesselImo: 'IMO1',
  fileNumber: 'F1',
  consigneeName: 'A',
  pod: 'Durban',
  incoterm: 'CIF',
  cargo: [{ customsValue: 1000 }],
  ...over,
});

const bond = (amount = 100) => ({
  securityType: GeneralAverageSecurity.AVERAGE_BOND,
  amount,
  reference: 'BOND-1',
});

describe('GeneralAverageService', () => {
  let svc: GeneralAverageService;
  let prisma: FakePrisma;

  beforeEach(async () => {
    prisma = new FakePrisma();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [GeneralAverageService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    svc = mod.get(GeneralAverageService);
  });

  it('is defined', () => expect(svc).toBeDefined());

  // ── The release gate ────────────────────────────────────────────────────
  // The reason this module exists. Releasing cargo with no GA security on
  // record exposes the forwarder personally to the cargo owner's share.

  describe('release gate', () => {
    it('refuses to release cargo when no security has been lodged', async () => {
      prisma.events.push(ev());
      prisma.contributors.push(contrib());

      await expect(svc.releaseCargo(TENANT, 'ev-1', 'c-1', 'u-1')).rejects.toThrow(
        ConflictException,
      );
      await expect(svc.releaseCargo(TENANT, 'ev-1', 'c-1', 'u-1')).rejects.toThrow(
        /no general average security is on record/i,
      );
      // The refusal must actually stop the release, not just complain.
      expect(prisma.contributors[0].releasedAt).toBeNull();
    });

    it('refuses release when a security type is noted but never actually lodged', async () => {
      prisma.events.push(ev());
      // A clerk typed the bond details but never confirmed lodgement.
      prisma.contributors.push(
        contrib({
          securityType: GeneralAverageSecurity.AVERAGE_BOND,
          securityAmount: 500,
          securityLodgedAt: null,
        }),
      );

      await expect(svc.releaseCargo(TENANT, 'ev-1', 'c-1', 'u-1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.contributors[0].releasedAt).toBeNull();
    });

    it('releases cargo once confirmed security is on record', async () => {
      prisma.events.push(ev());
      prisma.contributors.push(contrib({ securityLodgedAt: new Date(), securityAmount: 500 }));

      await svc.releaseCargo(TENANT, 'ev-1', 'c-1', 'u-1');

      expect(prisma.contributors[0].releasedAt).toBeInstanceOf(Date);
      expect(prisma.contributors[0].releasedBy).toBe('u-1');
    });

    it('refuses a second release of the same cargo', async () => {
      prisma.events.push(ev());
      prisma.contributors.push(contrib({ securityLodgedAt: new Date(), releasedAt: new Date() }));

      await expect(svc.releaseCargo(TENANT, 'ev-1', 'c-1', 'u-1')).rejects.toThrow(
        /already recorded as released/i,
      );
    });

    it('canReleaseCargo is true only when security is lodged', () => {
      expect(svc.canReleaseCargo({ securityLodgedAt: null })).toBe(false);
      expect(svc.canReleaseCargo({ securityLodgedAt: new Date() })).toBe(true);
    });
  });

  // ── Security collection and status ──────────────────────────────────────

  describe('security', () => {
    it('advances DECLARED -> SECURING on partial security, SECURED when complete', async () => {
      prisma.events.push(ev());
      prisma.contributors.push(contrib({ id: 'c-1' }));
      prisma.contributors.push(contrib({ id: 'c-2', shipmentFileId: 'sf-2' }));

      await svc.lodgeSecurity(TENANT, 'ev-1', 'c-1', bond());
      expect(prisma.events[0].status).toBe(GeneralAverageStatus.SECURING);

      await svc.lodgeSecurity(TENANT, 'ev-1', 'c-2', bond(200));
      expect(prisma.events[0].status).toBe(GeneralAverageStatus.SECURED);
    });

    it('refuses a zero or negative security amount', async () => {
      prisma.events.push(ev());
      prisma.contributors.push(contrib());

      await expect(svc.lodgeSecurity(TENANT, 'ev-1', 'c-1', bond(0))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses to overwrite security that is already lodged', async () => {
      prisma.events.push(ev());
      prisma.contributors.push(contrib({ securityLodgedAt: new Date(), securityAmount: 100 }));

      await expect(svc.lodgeSecurity(TENANT, 'ev-1', 'c-1', bond(999))).rejects.toThrow(
        ConflictException,
      );
      // The original figure must survive the rejected amendment.
      expect(prisma.contributors[0].securityAmount).toBe(100);
    });
  });

  // ── Tenant isolation ────────────────────────────────────────────────────

  it('does not find another tenant’s event', async () => {
    prisma.events.push(ev({ companyId: OTHER }));
    await expect(svc.getEvent(TENANT, 'ev-1')).rejects.toThrow(NotFoundException);
  });

  it('does not release another tenant’s cargo', async () => {
    prisma.events.push(ev({ companyId: OTHER }));
    prisma.contributors.push(contrib({ securityLodgedAt: new Date() }));
    await expect(svc.releaseCargo(TENANT, 'ev-1', 'c-1', 'u-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.contributors[0].releasedAt).toBeNull();
  });

  it('does not settle another tenant’s event', async () => {
    prisma.events.push(ev({ companyId: OTHER }));
    await expect(svc.settle(TENANT, 'ev-1')).rejects.toThrow(NotFoundException);
  });

  // ── Contributor discovery ───────────────────────────────────────────────

  it('discovers ocean files on the same voyage and skips ones already recorded', async () => {
    prisma.events.push(ev());
    prisma.files.push(oceanFile());
    prisma.files.push(
      oceanFile({ id: 'sf-2', fileNumber: 'F2', consigneeName: 'B', incoterm: 'FOB', cargo: [{ customsValue: 500 }] }),
    );
    prisma.contributors.push(contrib({ shipmentFileId: 'sf-1' }));

    const out = await svc.discoverContributors(TENANT, 'ev-1');

    expect(out.matchedOn).toBe('voyage');
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0].shipmentFileId).toBe('sf-2');
    expect(out.candidates[0].suggestedValue).toBe(500);
  });

  it('flags non-CIF incoterms for review instead of silently converting them', async () => {
    prisma.events.push(ev());
    prisma.files.push(oceanFile({ id: 'sf-1', incoterm: 'FOB' }));
    prisma.files.push(oceanFile({ id: 'sf-2', incoterm: 'CIF', fileNumber: 'F2' }));
    prisma.files.push(oceanFile({ id: 'sf-3', incoterm: 'CIP', fileNumber: 'F3' }));

    const out = await svc.discoverContributors(TENANT, 'ev-1');
    const byId = Object.fromEntries(out.candidates.map((c: any) => [c.shipmentFileId, c]));

    // FOB has no freight or insurance in it; converting needs real figures.
    expect(byId['sf-1'].needsReview).toBe(true);
    expect(byId['sf-2'].needsReview).toBe(false);
    expect(byId['sf-3'].needsReview).toBe(false);
  });

  it('flags a file with no cargo value, since a zero value cannot be right', async () => {
    prisma.events.push(ev());
    prisma.files.push(oceanFile({ cargo: [] }));

    const out = await svc.discoverContributors(TENANT, 'ev-1');
    expect(out.candidates[0].suggestedValue).toBe(0);
    expect(out.candidates[0].needsReview).toBe(true);
  });

  it('returns no candidates when the event names no vessel to match on', async () => {
    prisma.events.push(ev({ voyageNumber: null, vesselImo: null, vesselMmsi: null }));
    prisma.files.push(oceanFile());

    const out = await svc.discoverContributors(TENANT, 'ev-1');
    expect(out).toEqual({ candidates: [], matchedOn: 'nothing' });
  });

  // ── Share arithmetic ────────────────────────────────────────────────────

  it('allocates expenditure and sacrifice pro-rata to contributory value', async () => {
    // Pool 1200 across values 1000 / 2000 / 3000 -> 200 / 400 / 600.
    prisma.events.push(ev({ totalExpenditure: 700, totalSacrifice: 500 }));
    prisma.contributors.push(contrib({ id: 'c-1', contributoryValue: 1000 }));
    prisma.contributors.push(contrib({ id: 'c-2', shipmentFileId: 'sf-2', contributoryValue: 2000 }));
    prisma.files.push(oceanFile({ id: 'sf-3', fileNumber: 'F3' }));

    await svc.addContributor(TENANT, 'ev-1', {
      shipmentFileId: 'sf-3',
      contributoryValue: 3000,
      valueBasis: GeneralAverageValueBasis.CIF,
    });

    const byId = Object.fromEntries(prisma.contributors.map((c) => [c.id, c]));
    expect(byId['c-1'].sharePct).toBeCloseTo(16.667, 2);
    expect(byId['c-2'].sharePct).toBeCloseTo(33.333, 2);
    expect(byId['c-1'].estimatedContribution).toBe(200);
    expect(byId['c-2'].estimatedContribution).toBe(400);
    expect(prisma.contributors.find((c) => c.shipmentFileId === 'sf-3')?.estimatedContribution).toBe(600);
  });

  it('leaves shares undefined rather than dividing by zero when the total is 0', async () => {
    prisma.events.push(ev({ totalExpenditure: 100 }));
    prisma.contributors.push(contrib({ contributoryValue: 0 }));

    await svc.recomputeShares(TENANT, 'ev-1');

    expect(prisma.contributors[0].sharePct).toBeNull();
    expect(prisma.contributors[0].estimatedContribution).toBeNull();
  });

  it('rejects a negative contributory value', async () => {
    prisma.events.push(ev());
    prisma.files.push(oceanFile());

    await expect(
      svc.addContributor(TENANT, 'ev-1', { shipmentFileId: 'sf-1', contributoryValue: -5 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a shipment file that does not belong to the tenant', async () => {
    prisma.events.push(ev());
    prisma.files.push(oceanFile({ id: 'sf-x', companyId: OTHER }));

    await expect(
      svc.addContributor(TENANT, 'ev-1', { shipmentFileId: 'sf-x', contributoryValue: 10 }),
    ).rejects.toThrow(NotFoundException);
  });

  // ── Award true-up ───────────────────────────────────────────────────────

  it('records the award and computes the balance still owed', async () => {
    prisma.events.push(ev());
    prisma.contributors.push(contrib({ securityAmount: 100 }));

    await svc.recordAward(TENANT, 'ev-1', {
      contributions: [{ contributorId: 'c-1', assessedContribution: 250 }],
      adjusterName: 'Richards Hogg Lindley',
    });

    expect(prisma.events[0].status).toBe(GeneralAverageStatus.ADJUSTED);
    expect(prisma.events[0].adjusterName).toBe('Richards Hogg Lindley');
    expect(prisma.contributors[0].assessedContribution).toBe(250);
    // Assessed 250, secured 100 -> 150 still owed.
    expect(prisma.contributors[0].balanceDue).toBe(150);
  });

  it('shows a refund as a negative balance when too much security was taken', async () => {
    prisma.events.push(ev());
    prisma.contributors.push(contrib({ securityAmount: 400 }));

    await svc.recordAward(TENANT, 'ev-1', {
      contributions: [{ contributorId: 'c-1', assessedContribution: 250 }],
    });

    expect(prisma.contributors[0].balanceDue).toBe(-150);
  });

  it('refuses an award with no assessed contributions', async () => {
    prisma.events.push(ev());
    await expect(
      svc.recordAward(TENANT, 'ev-1', { contributions: [] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('only amends contributors named in the award', async () => {
    prisma.events.push(ev());
    prisma.contributors.push(contrib({ id: 'c-1', securityAmount: 100 }));
    prisma.contributors.push(contrib({ id: 'c-2', shipmentFileId: 'sf-2', securityAmount: 100 }));

    await svc.recordAward(TENANT, 'ev-1', {
      contributions: [{ contributorId: 'c-1', assessedContribution: 250 }],
    });

    const byId = Object.fromEntries(prisma.contributors.map((c) => [c.id, c]));
    expect(byId['c-1'].assessedContribution).toBe(250);
    // c-2 was not in the award, so it must not gain a fabricated balance.
    expect(byId['c-2'].assessedContribution).toBeNull();
    expect(byId['c-2'].balanceDue).toBeNull();
  });

  // ── Settlement ──────────────────────────────────────────────────────────

  it('refuses to settle while any balance is outstanding', async () => {
    prisma.events.push(ev({ status: GeneralAverageStatus.ADJUSTED }));
    prisma.contributors.push(contrib({ balanceDue: 150 }));

    await expect(svc.settle(TENANT, 'ev-1')).rejects.toThrow(ConflictException);
    await expect(svc.settle(TENANT, 'ev-1')).rejects.toThrow(/still owe a balance/i);
    expect(prisma.events[0].status).toBe(GeneralAverageStatus.ADJUSTED);
  });

  it('settles when no balance is outstanding, and a refund does not block it', async () => {
    prisma.events.push(ev({ status: GeneralAverageStatus.ADJUSTED }));
    prisma.contributors.push(contrib({ id: 'c-1', balanceDue: 0 }));
    prisma.contributors.push(contrib({ id: 'c-2', shipmentFileId: 'sf-2', balanceDue: -150 }));

    await svc.settle(TENANT, 'ev-1');

    expect(prisma.events[0].status).toBe(GeneralAverageStatus.SETTLED);
    expect(prisma.contributors.every((c) => c.settledAt instanceof Date)).toBe(true);
  });

  // ── Every tenant query runs inside withTenant ───────────────────────────

  it('never touches the database outside withTenant', async () => {
    prisma.events.push(ev());
    prisma.contributors.push(contrib());

    await svc.getEvent(TENANT, 'ev-1');
    await svc.listEvents(TENANT);
    await svc.discoverContributors(TENANT, 'ev-1');
    await svc.recomputeShares(TENANT, 'ev-1');

    const modelCalls = prisma.calls.filter((c) => !c.startsWith('withTenant:'));
    expect(modelCalls.length).toBeGreaterThan(0);
    // The fake only exposes model delegates through withTenant, so any bare
    // this.prisma.<model> call in the service would have thrown above.
    expect(prisma.calls.filter((c) => c.startsWith('withTenant:')).length).toBeGreaterThan(0);
    // And every withTenant call is scoped to the tenant that asked.
    expect([...new Set(prisma.calls.filter((c) => c.startsWith('withTenant:')))]).toEqual([
      `withTenant:${TENANT}`,
    ]);
  });
});
