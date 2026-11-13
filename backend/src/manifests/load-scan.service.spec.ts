import { LoadScanService } from './load-scan.service';

/**
 * Load control, tested as a procedure rather than as a happy path.
 *
 * The interesting cases are all refusals. Each one is a situation a real
 * operator hits in a real depot, and each has a different correct answer:
 *
 *   - re-scanning a parcel already on this vehicle -> idempotent, not an error
 *   - a parcel already on another vehicle          -> refuse
 *   - a delivered or cancelled parcel              -> refuse
 *   - scanning after the vehicle left              -> refuse
 *
 * Collapsing any two of these into one answer is how load control fails: an
 * operator who is told "already loaded" for a parcel they just scanned learns
 * to ignore the message, and an operator who is told "verified" for a parcel
 * on another truck has silently put one parcel on two vehicles.
 */

const MANIFEST = 'manifest-1';
const TRACKING = 'WB-0001';

interface WaybillRow {
  id: string;
  trackingNumber: string;
  companyId: string;
  status: string;
  recipientName?: string;
}

function makeHarness(opts: {
  manifests?: any[];
  waybills?: WaybillRow[];
  links?: Array<{ manifestId: string; waybillId: string; scannedAt?: Date | null }>;
} = {}) {
  const waybills: WaybillRow[] = (opts.waybills ?? []).map((w) => ({ ...w }));
  const links = (opts.links ?? []).map((l) => ({ ...l, scannedAt: l.scannedAt ?? null }));
  const manifests = (opts.manifests ?? []).map((m) => ({ ...m }));

  const prisma: any = {
    manifest: {
      findFirst: jest.fn(async ({ where }: any) => {
        const m = manifests.find(
          (x) => x.id === where.id && (!where.companyId || x.companyId === where.companyId),
        );
        if (!m) return null;
        return {
          id: m.id,
          dispatched: m.dispatched ?? false,
          dispatchedAt: m.dispatchedAt ?? null,
          waybills: links
            .filter((l) => l.manifestId === m.id)
            .map((l) => ({
              scannedAt: l.scannedAt,
              waybill: waybills.find((w) => w.id === l.waybillId),
            }))
            .filter((x: any) => x.waybill),
        };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        let n = 0;
        for (const m of manifests) {
          if (m.id !== where.id) continue;
          if (where.companyId && m.companyId !== where.companyId) continue;
          if (where.dispatched === false && m.dispatched !== false) continue;
          Object.assign(m, data);
          n += 1;
        }
        return { count: n };
      }),
    },
    waybill: {
      findFirst: jest.fn(async ({ where }: any) => {
        const w = waybills.find(
          (x) => x.trackingNumber === where.trackingNumber && x.companyId === where.companyId,
        );
        return w ? { ...w } : null;
      }),
      findUnique: jest.fn(async ({ where }: any) => waybills.find((w) => w.id === where.id) ?? null),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const statusIn: string[] = where.status?.in ?? [];
        let n = 0;
        for (const w of waybills) {
          if (w.id !== where.id) continue;
          if (where.companyId && w.companyId !== where.companyId) continue;
          if (statusIn.length && !statusIn.includes(w.status)) continue;
          Object.assign(w, data);
          n += 1;
        }
        return { count: n };
      }),
    },
    manifestWaybill: {
      findUnique: jest.fn(async ({ where }: any) => {
        const k = where.manifestId_waybillId;
        return links.find((l) => l.manifestId === k.manifestId && l.waybillId === k.waybillId) ?? null;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const k = where.manifestId_waybillId;
        const l = links.find((x) => x.manifestId === k.manifestId && x.waybillId === k.waybillId);
        if (l) Object.assign(l, data);
        return l;
      }),
    },
  };

  // The service runs its reads and writes inside withTenant(), so the mock has
  // to provide it. `prisma` is captured by closure and resolved at call time.
  prisma.withTenant = jest.fn(async (companyId: string, fn: (tx: any) => Promise<any>) => {
    if (typeof companyId !== 'string' || companyId.trim() === '') throw new Error('empty tenant');
    return fn(prisma);
  });

  return { service: new LoadScanService(prisma), prisma, waybills, links, manifests };
}

function fixture(status: string, extra: Partial<WaybillRow> = {}, scannedAt: Date | null = null) {
  return makeHarness({
    manifests: [{ id: MANIFEST, companyId: 'company-1', dispatched: false }],
    waybills: [
      { id: 'wb-1', trackingNumber: TRACKING, companyId: 'company-1', status, recipientName: 'Thandi Mokoena', ...extra },
    ],
    links: [{ manifestId: MANIFEST, waybillId: 'wb-1', scannedAt }],
  });
}

describe('LoadScanService — the happy path', () => {
  for (const status of ['PENDING', 'COLLECTED', 'AT_ORIGIN_HUB']) {
    it(`loads a waybill that is ${status}`, async () => {
      const { service } = fixture(status);
      const result = await service.verifyScan('company-1', MANIFEST, TRACKING);

      expect(result.status).toBe('VERIFIED');
      expect(result.waybillId).toBe('wb-1');
      expect(result.recipientName).toBe('Thandi Mokoena');
    });
  }

  it('moves the waybill to IN_TRANSIT', async () => {
    const { service, waybills } = fixture('PENDING');
    await service.verifyScan('company-1', MANIFEST, TRACKING);
    expect(waybills[0].status).toBe('IN_TRANSIT');
  });

  it('stamps the scan on the manifest link, not just the waybill', async () => {
    const { service, links } = fixture('PENDING');
    await service.verifyScan('company-1', MANIFEST, TRACKING);
    expect(links[0].scannedAt).toBeInstanceOf(Date);
  });

  it('writes the transition as compare-and-set, not read-then-write', async () => {
    const { service, prisma } = fixture('PENDING');
    await service.verifyScan('company-1', MANIFEST, TRACKING);

    // The expected current state is part of the WHERE, so a concurrent scan
    // cannot also succeed.
    expect(prisma.waybill.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: expect.arrayContaining(['PENDING']) } }),
      }),
    );
  });
});

describe('LoadScanService — re-scans are idempotent, not errors', () => {
  it('reports ALREADY_SCANNED for a parcel already loaded onto this manifest', async () => {
    const { service } = fixture('IN_TRANSIT', {}, new Date('2026-11-16T08:00:00Z'));
    const result = await service.verifyScan('company-1', MANIFEST, TRACKING);

    expect(result.status).toBe('ALREADY_SCANNED');
    expect(result.reason).toBeTruthy();
  });

  it('does not move a parcel that is already in transit', async () => {
    const { service, waybills } = fixture('IN_TRANSIT', {}, new Date());
    await service.verifyScan('company-1', MANIFEST, TRACKING);
    expect(waybills[0].status).toBe('IN_TRANSIT');
  });

  it('scanning twice in a row verifies then reports the duplicate', async () => {
    const { service } = fixture('PENDING');
    expect((await service.verifyScan('company-1', MANIFEST, TRACKING)).status).toBe('VERIFIED');
    // A missed beep, or a second operator running a verification pass.
    expect((await service.verifyScan('company-1', MANIFEST, TRACKING)).status).toBe('ALREADY_SCANNED');
  });
});

describe('LoadScanService — one parcel, one vehicle', () => {
  it('refuses a parcel that is in transit but was never scanned onto this manifest', async () => {
    // Already loaded elsewhere: this manifest's link is unstamped.
    const { service, links } = fixture('IN_TRANSIT');
    const result = await service.verifyScan('company-1', MANIFEST, TRACKING);

    expect(result.status).toBe('ALREADY_LOADED_ELSEWHERE');
    expect(result.currentStatus).toBe('IN_TRANSIT');
    // The load plan must not claim it was loaded here.
    expect(links[0].scannedAt).toBeNull();
  });

  it('distinguishes that from a re-scan, which is the whole point of scannedAt', async () => {
    const elsewhere = await fixture('IN_TRANSIT').service.verifyScan('company-1', MANIFEST, TRACKING);
    const rescanned = await fixture('IN_TRANSIT', {}, new Date()).service.verifyScan('company-1', MANIFEST, TRACKING);

    // Same waybill status. Opposite answers.
    expect(elsewhere.status).toBe('ALREADY_LOADED_ELSEWHERE');
    expect(rescanned.status).toBe('ALREADY_SCANNED');
  });

  it('reports honestly when a concurrent scan wins the race', async () => {
    const { service, prisma } = fixture('PENDING');
    // Another operator moved it between our read and our write.
    prisma.waybill.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await service.verifyScan('company-1', MANIFEST, TRACKING);
    expect(result.status).toBe('ALREADY_LOADED_ELSEWHERE');
    expect(result.reason).toMatch(/another scan/i);
  });
});

describe('LoadScanService — a parcel past loading is not put back on a truck', () => {
  for (const status of ['DELIVERED', 'CANCELLED', 'RETURNED', 'FAILED_DELIVERY', 'OUT_FOR_DELIVERY', 'AT_DESTINATION_HUB']) {
    it(`refuses a waybill that is ${status}`, async () => {
      const { service, waybills } = fixture(status);
      const result = await service.verifyScan('company-1', MANIFEST, TRACKING);

      expect(result.status).toBe('NOT_LOADABLE');
      expect(result.currentStatus).toBe(status);
      // The state must be untouched, not overwritten.
      expect(waybills[0].status).toBe(status);
    });
  }

  it('says why, naming the state it found', async () => {
    const { service } = fixture('DELIVERED');
    const result = await service.verifyScan('company-1', MANIFEST, TRACKING);
    expect(result.reason).toMatch(/DELIVERED/);
  });
});

describe('LoadScanService — the manifest itself', () => {
  it('refuses to load a vehicle that has already left', async () => {
    const { service, waybills } = makeHarness({
      manifests: [{ id: MANIFEST, companyId: 'company-1', dispatched: true, dispatchedAt: new Date() }],
      waybills: [{ id: 'wb-1', trackingNumber: TRACKING, companyId: 'company-1', status: 'PENDING' }],
      links: [{ manifestId: MANIFEST, waybillId: 'wb-1' }],
    });

    const result = await service.verifyScan('company-1', MANIFEST, TRACKING);
    expect(result.status).toBe('MANIFEST_DISPATCHED');
    // The parcel is still on the floor. Marking it in transit would lie.
    expect(waybills[0].status).toBe('PENDING');
  });

  it('refuses a manifest belonging to another company', async () => {
    const { service } = makeHarness({
      manifests: [{ id: MANIFEST, companyId: 'company-2', dispatched: false }],
      waybills: [{ id: 'wb-1', trackingNumber: TRACKING, companyId: 'company-1', status: 'PENDING' }],
      links: [{ manifestId: MANIFEST, waybillId: 'wb-1' }],
    });

    expect((await service.verifyScan('company-1', MANIFEST, TRACKING)).status).toBe('MANIFEST_NOT_FOUND');
  });

  it('refuses a tracking number from another company', async () => {
    const { service } = makeHarness({
      manifests: [{ id: MANIFEST, companyId: 'company-1', dispatched: false }],
      waybills: [{ id: 'wb-1', trackingNumber: TRACKING, companyId: 'company-2', status: 'PENDING' }],
      links: [{ manifestId: MANIFEST, waybillId: 'wb-1' }],
    });

    expect((await service.verifyScan('company-1', MANIFEST, TRACKING)).status).toBe('NOT_FOUND');
  });

  it('refuses a waybill that is not scheduled on this manifest', async () => {
    const { service } = makeHarness({
      manifests: [{ id: MANIFEST, companyId: 'company-1', dispatched: false }],
      waybills: [{ id: 'wb-1', trackingNumber: TRACKING, companyId: 'company-1', status: 'PENDING' }],
      links: [],
    });

    const result = await service.verifyScan('company-1', MANIFEST, TRACKING);
    expect(result.status).toBe('NOT_ON_MANIFEST');
  });
});

describe('LoadScanService — completing the load', () => {
  function loading() {
    return makeHarness({
      manifests: [{ id: MANIFEST, companyId: 'company-1', dispatched: false }],
      waybills: [
        { id: 'wb-1', trackingNumber: 'WB-1', companyId: 'company-1', status: 'IN_TRANSIT' },
        { id: 'wb-2', trackingNumber: 'WB-2', companyId: 'company-1', status: 'PENDING' },
      ],
      links: [
        { manifestId: MANIFEST, waybillId: 'wb-1', scannedAt: new Date() },
        { manifestId: MANIFEST, waybillId: 'wb-2', scannedAt: null },
      ],
    });
  }

  it('counts what was scanned, not what merely happens to be IN_TRANSIT', async () => {
    const { service } = loading();
    const result: any = await service.completeLoad('company-1', MANIFEST);

    expect(result.status).toBe('DISPATCHED');
    expect(result.loaded).toBe(1);
    expect(result.unscanned).toHaveLength(1);
    expect(result.unscanned[0].trackingNumber).toBe('WB-2');
  });

  it('does not restamp the departure time when dispatched twice', async () => {
    const { service, manifests } = loading();
    await service.completeLoad('company-1', MANIFEST);
    const first = manifests[0].dispatchedAt;

    const second: any = await service.completeLoad('company-1', MANIFEST);
    expect(second.status).toBe('ALREADY_DISPATCHED');
    expect(manifests[0].dispatchedAt).toBe(first);
  });

  it('still reports the shortfall when already dispatched', async () => {
    const { service } = loading();
    await service.completeLoad('company-1', MANIFEST);
    const second: any = await service.completeLoad('company-1', MANIFEST);

    expect(second.unscanned).toHaveLength(1);
    expect(second.loaded).toBe(1);
  });

  it('refuses a manifest from another company', async () => {
    const { service } = makeHarness({
      manifests: [{ id: MANIFEST, companyId: 'company-2', dispatched: false }],
    });
    const result: any = await service.completeLoad('company-1', MANIFEST);
    expect(result.status).toBe('MANIFEST_NOT_FOUND');
  });

  it('dispatches with compare-and-set so two requests cannot both win', async () => {
    const { service } = loading();
    await service.completeLoad('company-1', MANIFEST);
    // A concurrent dispatcher: the second updateMany matches nothing.
    const result: any = await service.completeLoad('company-1', MANIFEST);
    expect(result.status).toBe('ALREADY_DISPATCHED');
  });
});
