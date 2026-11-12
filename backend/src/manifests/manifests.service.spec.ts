import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ManifestsService } from './manifests.service';

/**
 * MANIFESTS — linehaul loads.
 *
 * A manifest says "these waybills left on this truck". Two things go wrong in
 * create(): the code is allocated by counting, and the loadability check reads
 * the waybills before the insert rather than during it.
 */

const COMPANY = 'co-1';
const OTHER = 'co-2';

function makePrisma(opts: { waybills?: any[] } = {}) {
  const manifests: any[] = [];
  let seq = 0;
  const tenants: string[] = [];
  const ops: string[] = [];
  const lockChains = new Map<string, Promise<void>>();
  const released: Array<() => void> = [];
  let manifestCountCalls = 0;

  const waybills: any[] = (opts.waybills ?? []).map((w) => ({ ...w }));

  const manifestModel = {
    count: jest.fn(async () => {
      manifestCountCalls += 1;
      ops.push('count');
      return manifests.length;
    }),
    create: jest.fn(async ({ data }: any) => {
      ops.push('create');
      const row = { id: `man-${++seq}`, ...data };
      manifests.push(row);
      return { ...row, waybills: [] };
    }),
    findFirst: jest.fn(async ({ where }: any) => manifests.find((m) => m.id === where.id) ?? null),
    updateMany: jest.fn(async ({ where, data }: any) => {
      ops.push('updateMany');
      let n = 0;
      for (const m of manifests) {
        if (m.id === where.id && m.companyId === where.companyId) {
          Object.assign(m, data);
          n += 1;
        }
      }
      return { count: n };
    }),
  };

  const waybillModel = {
    findMany: jest.fn(async ({ where }: any) => {
      ops.push('waybill.findMany');
      return waybills.filter(
        (w) => where.id.in.includes(w.id) && (where.companyId ? w.companyId === where.companyId : true),
      );
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      ops.push('waybill.updateMany');
      let n = 0;
      for (const w of waybills) {
        if (where.id.in.includes(w.id) && w.companyId === where.companyId) {
          Object.assign(w, data);
          n += 1;
        }
      }
      return { count: n };
    }),
  };

  const tx: any = {
    manifest: manifestModel,
    waybill: waybillModel,
    $executeRaw: jest.fn(async (strings: any, ...values: any[]) => {
      const sql = String(strings?.sql ?? strings?.raw?.[0] ?? strings ?? '');
      if (!/pg_advisory_xact_lock/.test(sql)) return [];
      const key = String(values[0] ?? 'default');
      const prev = lockChains.get(key) ?? Promise.resolve();
      let release!: () => void;
      const held = new Promise<void>((r) => {
        release = r;
      });
      lockChains.set(key, prev.then(() => held));
      await prev;
      released.push(release);
      return [];
    }),
  };

  const prisma: any = {
    manifest: manifestModel,
    waybill: waybillModel,
    withTenant: jest.fn(async (companyId: string, fn: any) => {
      tenants.push(companyId);
      try {
        return await fn(tx);
      } finally {
        released.splice(0).forEach((r) => r());
      }
    }),
    __manifests: manifests,
    __waybills: waybills,
    __tenants: tenants,
    __ops: ops,
    __countCalls: () => manifestCountCalls,
  };
  return prisma;
}

const build = (prisma: any) => new ManifestsService(prisma);

const readyWaybills = (ids: string[], companyId = COMPANY) =>
  ids.map((id) => ({ id, companyId, trackingNumber: `WB-${id}`, status: 'AT_ORIGIN_HUB' }));

describe('ManifestsService — create', () => {
  it('allocates distinct manifest codes', async () => {
    const prisma = makePrisma({ waybills: readyWaybills(['wb-1', 'wb-2']) });
    const a = await build(prisma).create(COMPANY, { waybillIds: ['wb-1'] });
    const b = await build(prisma).create(COMPANY, { waybillIds: ['wb-2'] });
    expect(a.code).not.toEqual(b.code);
  });

  it('never issues the same code to two manifests created together', async () => {
    // FAILED BEFORE: `count` then `count + 1`. Two creates in flight saw the same
    // count and produced two manifests both called MAN-00001. There is no unique
    // constraint to catch it, so two trucks leave with indistinguishable
    // paperwork — the code is what a depot quotes when it asks where a load is.
    const prisma = makePrisma({ waybills: readyWaybills(['wb-1', 'wb-2', 'wb-3']) });
    const svc = build(prisma);

    const [a, b] = await Promise.all([
      svc.create(COMPANY, { waybillIds: ['wb-1'] }),
      svc.create(COMPANY, { waybillIds: ['wb-2'] }),
    ]);

    expect(a.code).not.toEqual(b.code);
  });

  it('allocates the code inside the tenant transaction', async () => {
    const prisma = makePrisma({ waybills: readyWaybills(['wb-1']) });
    await build(prisma).create(COMPANY, { waybillIds: ['wb-1'] });
    expect(prisma.__tenants).toContain(COMPANY);
  });

  it('refuses to load a waybill that is not at the origin hub', async () => {
    const prisma = makePrisma({ waybills: [{ id: 'wb-1', companyId: COMPANY, trackingNumber: 'WB-1', status: 'CREATED' }] });
    await expect(build(prisma).create(COMPANY, { waybillIds: ['wb-1'] })).rejects.toThrow(BadRequestException);
  });

  it('refuses to load another tenant’s waybill', async () => {
    const prisma = makePrisma({ waybills: readyWaybills(['wb-1'], OTHER) });
    await expect(build(prisma).create(COMPANY, { waybillIds: ['wb-1'] })).rejects.toThrow(BadRequestException);
    expect(prisma.__manifests).toHaveLength(0);
  });

  it('does not create the manifest when the loadability check fails', async () => {
    const prisma = makePrisma({ waybills: [{ id: 'wb-1', companyId: COMPANY, trackingNumber: 'WB-1', status: 'DELIVERED' }] });
    await expect(build(prisma).create(COMPANY, { waybillIds: ['wb-1'] })).rejects.toThrow(BadRequestException);
    expect(prisma.__manifests).toHaveLength(0);
  });
});

describe('ManifestsService — update / receiveManifest', () => {
  it('update cannot re-home a manifest into another tenant', async () => {
    const prisma = makePrisma();
    await build(prisma).create(COMPANY, { waybillIds: [] }).catch(() => undefined);
    prisma.__manifests.push({ id: 'man-1', companyId: COMPANY, code: 'MAN-00001' });

    await build(prisma).update('man-1', COMPANY, { companyId: OTHER, destination: 'Joburg' });
    expect(prisma.__manifests.find((m) => m.id === 'man-1').companyId).toEqual(COMPANY);
  });

  it('update on another tenant’s manifest is not found', async () => {
    const prisma = makePrisma();
    prisma.__manifests.push({ id: 'man-1', companyId: OTHER, code: 'MAN-00001' });
    await expect(build(prisma).update('man-1', COMPANY, {})).rejects.toThrow(NotFoundException);
  });

  it('receiveManifest moves parcels to the destination hub, not backwards to collected', async () => {
    const prisma = makePrisma({ waybills: readyWaybills(['wb-1']) });
    prisma.__manifests.push({
      id: 'man-1',
      companyId: COMPANY,
      code: 'MAN-00001',
      waybills: [{ waybillId: 'wb-1' }],
    });

    await build(prisma).receiveManifest('man-1', COMPANY);

    expect(prisma.__waybills.find((w) => w.id === 'wb-1').status).toEqual('AT_DESTINATION_HUB');
  });

  it('receiveManifest is tenant-scoped', async () => {
    const prisma = makePrisma({ waybills: readyWaybills(['wb-1'], OTHER) });
    prisma.__manifests.push({
      id: 'man-1',
      companyId: OTHER,
      code: 'MAN-00001',
      waybills: [{ waybillId: 'wb-1' }],
    });

    await expect(build(prisma).receiveManifest('man-1', COMPANY)).rejects.toThrow(NotFoundException);
    expect(prisma.__waybills.find((w) => w.id === 'wb-1').status).toEqual('AT_ORIGIN_HUB');
  });
});

describe('ManifestsService — a code that is already taken', () => {
  // (companyId, code) became unique in migration
  // 20261113090000_unique_business_references. The advisory lock stops two
  // concurrent creates colliding, but the code is COUNT()+1 — so deleting a
  // manifest lowers the count and reissues a code that is still on a live row.
  // Before the constraint that produced two manifests sharing a printed code;
  // with the constraint it produces a P2002, which has to be translated or it
  // surfaces as a 500 that looks like an outage.

  const p2002 = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

  it('reports a reused code as a conflict, not a server error', async () => {
    const prisma = makePrisma({ waybills: readyWaybills(['wb-1']) });
    prisma.manifest.create.mockRejectedValueOnce(p2002());

    await expect(build(prisma).create(COMPANY, { waybillIds: ['wb-1'] })).rejects.toThrow(
      ConflictException,
    );
  });

  it('names the code and says nothing was created', async () => {
    const prisma = makePrisma({ waybills: readyWaybills(['wb-1']) });
    prisma.manifest.create.mockRejectedValueOnce(p2002());

    await expect(build(prisma).create(COMPANY, { waybillIds: ['wb-1'] })).rejects.toThrow(
      /MAN-00001.*no manifest was created/s,
    );
  });

  it('does not swallow any other database error', async () => {
    // Over-catching would turn a dead database into a polite 409.
    const prisma = makePrisma({ waybills: readyWaybills(['wb-1']) });
    prisma.manifest.create.mockRejectedValueOnce(new Error('connection terminated'));

    await expect(build(prisma).create(COMPANY, { waybillIds: ['wb-1'] })).rejects.toThrow(
      'connection terminated',
    );
  });
});
