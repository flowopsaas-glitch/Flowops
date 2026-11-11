import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DeliveryNotesService } from './delivery-notes.service';

/**
 * DELIVERY NOTES — operational notes attached to a tenant's deliveries.
 *
 * Every method here already scopes by companyId, and that is worth locking
 * down: this module had no tests at all, so the scoping was one careless edit
 * away from being lost. The two things that were actually wrong are the
 * unvalidated `waybillId` on create and the unfiltered `data: dto` on update.
 */

const COMPANY = 'co-1';
const VICTIM = 'co-2';

/**
 * Prisma treats an `undefined` value in a `where` clause as "not present" and
 * drops the condition. A fake that compared `row.id === undefined` would match
 * nothing and quietly hide that behaviour, so undefined terms are skipped here
 * the way Prisma skips them.
 */
const matches = (row: any, where: any) =>
  Object.entries(where ?? {}).every(([k, v]) => (v === undefined ? true : row[k] === v));

function makeHarness() {
  const notes: any[] = [];
  const waybills: any[] = [];
  let seq = 0;

  const deliveryNote = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `note-${++seq}`, isResolved: false, category: 'GENERAL', priority: 'NORMAL', ...data };
      notes.push(row);
      return { ...row };
    }),
    findMany: jest.fn(async ({ where }: any) => notes.filter((n) => matches(n, where))),
    findFirst: jest.fn(async ({ where }: any) => notes.find((n) => matches(n, where)) ?? null),
    update: jest.fn(async ({ where, data }: any) => {
      const n = notes.find((x) => x.id === where.id);
      if (!n) throw new Error('not found');
      Object.assign(n, data);
      return { ...n };
    }),
    delete: jest.fn(async ({ where }: any) => {
      const i = notes.findIndex((x) => x.id === where.id);
      if (i < 0) throw new Error('not found');
      return notes.splice(i, 1)[0];
    }),
  };

  const waybill = {
    findFirst: jest.fn(async ({ where }: any) => waybills.find((w) => matches(w, where)) ?? null),
  };

  const prisma: any = {
    deliveryNote,
    waybill,
    // withTenant sets Postgres RLS for the transaction: every query inside is
    // implicitly scoped to that company. The fake does the same by injecting
    // companyId into the where clause, so a lookup that forgets to scope cannot
    // pass by accident — which is the whole point of running inside withTenant.
    withTenant: jest.fn(async (cid: string, fn: any) =>
      fn({
        waybill: {
          findFirst: (args: any) =>
            waybill.findFirst({ ...args, where: { ...args.where, companyId: cid } }),
        },
      }),
    ),
    __notes: notes,
    __waybills: waybills,
  };
  return { prisma, svc: new DeliveryNotesService(prisma) };
}

const seedNote = (h: any, over: any = {}) => {
  const row = {
    id: 'note-1', companyId: COMPANY, content: 'original', priority: 'NORMAL',
    category: 'GENERAL', isResolved: false, waybillId: null, ...over,
  };
  h.prisma.__notes.push(row);
  return row;
};

describe('DeliveryNotesService — tenant scoping', () => {
  it('stamps the caller’s company on create, never one from the body', async () => {
    const h = makeHarness();
    await h.svc.create(COMPANY, 'u-1', 'Kader', { content: 'Gate locked' } as any);
    expect(h.prisma.__notes[0].companyId).toEqual(COMPANY);
  });

  it('cannot read another tenant’s note', async () => {
    const h = makeHarness();
    seedNote(h, { companyId: VICTIM });
    await expect(h.svc.findOne('note-1', COMPANY)).rejects.toThrow(NotFoundException);
  });

  it('cannot update another tenant’s note', async () => {
    const h = makeHarness();
    seedNote(h, { companyId: VICTIM });
    await expect(h.svc.update('note-1', COMPANY, { content: 'edited' })).rejects.toThrow(NotFoundException);
    expect(h.prisma.__notes[0].content).toEqual('original');
  });

  it('cannot delete another tenant’s note', async () => {
    const h = makeHarness();
    seedNote(h, { companyId: VICTIM });
    await expect(h.svc.remove('note-1', COMPANY)).rejects.toThrow(NotFoundException);
    expect(h.prisma.__notes).toHaveLength(1);
  });

  it('cannot resolve another tenant’s note', async () => {
    const h = makeHarness();
    seedNote(h, { companyId: VICTIM });
    await expect(h.svc.resolve('note-1', COMPANY)).rejects.toThrow(NotFoundException);
    expect(h.prisma.__notes[0].isResolved).toBe(false);
  });

  it('scopes list and waybill queries to the caller', async () => {
    const h = makeHarness();
    seedNote(h, { id: 'n-1', companyId: COMPANY, waybillId: 'wb-1' });
    seedNote(h, { id: 'n-2', companyId: VICTIM, waybillId: 'wb-1' });

    expect(await h.svc.findAll(COMPANY)).toHaveLength(1);
    expect(await h.svc.getByWaybill('wb-1', COMPANY)).toHaveLength(1);
  });
});

describe('DeliveryNotesService — the waybillId reference', () => {
  it('accepts a waybill belonging to the caller', async () => {
    const h = makeHarness();
    h.prisma.__waybills.push({ id: 'wb-1', companyId: COMPANY });

    const note = await h.svc.create(COMPANY, 'u-1', 'Kader', { content: 'ok', waybillId: 'wb-1' } as any);

    expect(note.waybillId).toEqual('wb-1');
  });

  it('refuses to attach a note to another tenant’s waybill', async () => {
    // FAILED BEFORE: `waybillId` is a loose String? column with no foreign key
    // and nothing checked it. Any tenant could name any waybill id, so a note
    // could be pinned to a parcel in a company the caller has nothing to do
    // with. Shipments already validated this exact reference; notes did not.
    const h = makeHarness();
    h.prisma.__waybills.push({ id: 'wb-1', companyId: VICTIM });

    await expect(
      h.svc.create(COMPANY, 'u-1', 'Kader', { content: 'pinned', waybillId: 'wb-1' } as any),
    ).rejects.toThrow(BadRequestException);

    expect(h.prisma.__notes).toHaveLength(0);
  });
});

describe('DeliveryNotesService — what an update is allowed to write', () => {
  it('writes the fields a client may own', async () => {
    const h = makeHarness();
    seedNote(h);

    const out = await h.svc.update('note-1', COMPANY, {
      content: 'edited', priority: 'HIGH', isResolved: true,
    } as any);

    expect(out.content).toEqual('edited');
    expect(out.priority).toEqual('HIGH');
    expect(out.isResolved).toBe(true);
  });

  it('ignores fields no client may own, even when handed them directly', async () => {
    // The global ValidationPipe strips undeclared properties, so this cannot be
    // reached over HTTP today — which is exactly why it is easy to lose. The
    // service now whitelists the same way Shipments does, so it is safe for
    // any caller, not only one that came through the pipe.
    const h = makeHarness();
    seedNote(h);

    await h.svc.update('note-1', COMPANY, {
      content: 'edited', companyId: VICTIM, id: 'note-999', createdBy: 'someone-else',
    } as any);

    const row = h.prisma.__notes[0];
    expect(row.companyId).toEqual(COMPANY);
    expect(row.id).toEqual('note-1');
    expect(row.createdBy).toBeUndefined();
    expect(row.content).toEqual('edited');
  });
});
