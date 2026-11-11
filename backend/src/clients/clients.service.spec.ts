import { NotFoundException } from '@nestjs/common';
import { ClientsService } from './clients.service';

/**
 * CLIENTS — the customer directory.
 *
 * The finding here is about the DTO, not the SQL. `CreateClientDto` was a
 * TypeScript *interface*, which compiles away — so the emitted parameter type
 * was `Object`, and Nest's ValidationPipe skips anything that is not a class.
 * No whitelist, no stripping. `update` then spread that raw body into Prisma
 * with no `companyId` after the spread, so a PATCH could relocate the row into
 * another company's directory.
 *
 * The service-level allowlist is what stops it for every caller; the DTO
 * classes are what let the pipe do its job again.
 */

const COMPANY = 'co-1';
const VICTIM = 'co-2';

const matches = (row: any, where: any) =>
  Object.entries(where ?? {}).every(([k, v]) => (v === undefined ? true : row[k] === v));

function makeHarness() {
  const clients: any[] = [];
  let seq = 0;

  const client = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `cli-${++seq}`, isActive: true, billingType: 'COD', createdAt: new Date(), ...data };
      clients.push(row);
      return { ...row };
    }),
    findMany: jest.fn(async ({ where }: any) => clients.filter((c) => matches(c, where))),
    findFirst: jest.fn(async ({ where }: any) => clients.find((c) => matches(c, where)) ?? null),
    update: jest.fn(async ({ where, data }: any) => {
      const c = clients.find((x) => x.id === where.id);
      if (!c) throw new Error('not found');
      Object.assign(c, data);
      return { ...c };
    }),
  };

  const prisma: any = { client, __clients: clients };
  return { prisma, svc: new ClientsService(prisma) };
}

const seedClient = (h: any, over: any = {}) => {
  const row = {
    id: 'cli-1', companyId: COMPANY, name: 'Acme Freight', billingType: 'COD',
    creditLimit: 1000, isActive: true, createdAt: new Date(), ...over,
  };
  h.prisma.__clients.push(row);
  return row;
};

describe('ClientsService — tenant scoping', () => {
  it('stamps the caller’s company on create', async () => {
    const h = makeHarness();
    const out = await h.svc.create(COMPANY, { name: 'Acme' });
    expect(out.companyId).toEqual(COMPANY);
  });

  it('defaults billingType to COD on create', async () => {
    const h = makeHarness();
    const out = await h.svc.create(COMPANY, { name: 'Acme' });
    expect(out.billingType).toEqual('COD');
  });

  it('cannot read another tenant’s client', async () => {
    const h = makeHarness();
    seedClient(h, { companyId: VICTIM });
    await expect(h.svc.findOne('cli-1', COMPANY)).rejects.toThrow(NotFoundException);
  });

  it('cannot soft-delete another tenant’s client', async () => {
    const h = makeHarness();
    seedClient(h, { companyId: VICTIM });
    await expect(h.svc.remove('cli-1', COMPANY)).rejects.toThrow(NotFoundException);
    expect(h.prisma.__clients[0].isActive).toBe(true);
  });

  it('remove soft-deletes rather than dropping the row', async () => {
    const h = makeHarness();
    seedClient(h);
    await h.svc.remove('cli-1', COMPANY);
    expect(h.prisma.__clients[0].isActive).toBe(false);
    expect(h.prisma.__clients).toHaveLength(1);
  });

  it('scopes the list to active clients of the caller', async () => {
    const h = makeHarness();
    seedClient(h, { id: 'a', companyId: COMPANY, isActive: true });
    seedClient(h, { id: 'b', companyId: COMPANY, isActive: false });
    seedClient(h, { id: 'c', companyId: VICTIM, isActive: true });

    expect((await h.svc.findAll(COMPANY)).map((c: any) => c.id)).toEqual(['a']);
  });

  it('filters the list by billing type', async () => {
    const h = makeHarness();
    seedClient(h, { id: 'a', billingType: 'COD' });
    seedClient(h, { id: 'b', billingType: 'CONTRACT' });
    expect((await h.svc.findAll(COMPANY, 'CONTRACT')).map((c: any) => c.id)).toEqual(['b']);
  });

  it('overview only aggregates the caller’s active clients', async () => {
    const h = makeHarness();
    seedClient(h, { id: 'a', companyId: COMPANY, billingType: 'CONTRACT', creditLimit: 1000 });
    seedClient(h, { id: 'b', companyId: COMPANY, isActive: false, creditLimit: 5000 });
    seedClient(h, { id: 'c', companyId: VICTIM, creditLimit: 9000 });

    const out: any = await h.svc.overview(COMPANY);

    expect(out.total).toEqual(1);
    expect(out.totalCreditExtended).toEqual(1000);
    expect(out.byBillingType.CONTRACT).toEqual(1);
  });
});

describe('ClientsService — what an update is allowed to write', () => {
  it('cannot move a client into another company', async () => {
    // FAILED BEFORE: `data: { ...dto, ... }` with no companyId after the spread,
    // and an interface DTO the ValidationPipe could never see.
    const h = makeHarness();
    seedClient(h);

    await h.svc.update('cli-1', COMPANY, { name: 'Renamed', companyId: VICTIM } as any);

    expect(h.prisma.__clients[0].companyId).toEqual(COMPANY);
    expect(h.prisma.__clients[0].name).toEqual('Renamed');
  });

  it('ignores every other column a client must not own', async () => {
    const h = makeHarness();
    seedClient(h);

    await h.svc.update('cli-1', COMPANY, {
      name: 'Renamed', id: 'cli-999', isActive: false, createdAt: new Date(0),
    } as any);

    const row = h.prisma.__clients[0];
    expect(row.id).toEqual('cli-1');
    expect(row.isActive).toBe(true);
    expect(row.createdAt).not.toEqual(new Date(0));
  });

  it('writes the fields a client may own', async () => {
    const h = makeHarness();
    seedClient(h);

    const out: any = await h.svc.update('cli-1', COMPANY, {
      name: 'Renamed', billingType: 'CONTRACT', creditLimit: 2500,
      paymentTerms: 30, notes: 'net 30',
    } as any);

    expect(out.name).toEqual('Renamed');
    expect(out.billingType).toEqual('CONTRACT');
    expect(out.creditLimit).toEqual(2500);
    expect(out.paymentTerms).toEqual(30);
  });

  it('parses contract dates into Date objects', async () => {
    const h = makeHarness();
    seedClient(h);

    await h.svc.update('cli-1', COMPANY, {
      contractStart: '2026-01-01T00:00:00.000Z',
      contractEnd: '2027-01-01T00:00:00.000Z',
    } as any);

    expect(h.prisma.__clients[0].contractStart).toBeInstanceOf(Date);
    expect(h.prisma.__clients[0].contractEnd).toBeInstanceOf(Date);
    expect(h.prisma.__clients[0].contractEnd.getUTCFullYear()).toEqual(2027);
  });

  it('cannot update another tenant’s client', async () => {
    const h = makeHarness();
    seedClient(h, { companyId: VICTIM });
    await expect(h.svc.update('cli-1', COMPANY, { name: 'Renamed' } as any)).rejects.toThrow(
      NotFoundException,
    );
    expect(h.prisma.__clients[0].name).toEqual('Acme Freight');
  });
});
