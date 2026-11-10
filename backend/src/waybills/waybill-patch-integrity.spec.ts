import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import { WaybillsService } from './waybills.service';

/**
 * Two separate defects in PATCH /waybills/:id, both found in the same block of
 * code and both the kind that only shows up under conditions you cannot
 * reproduce on a laptop.
 *
 * 1. MASS ASSIGNMENT. The controller takes `@Body() body: any`. With no DTO
 *    class there is no metatype, so the global ValidationPipe — even with
 *    `whitelist: true` — has nothing to whitelist against and passes the raw
 *    JSON straight through. The service then spread it into the Prisma
 *    update. findOne() scoped the LOOKUP to the tenant but the WRITE was
 *    `where: { id }` with an unfiltered data spread, so a tenant could set
 *    `companyId` and move their waybill into another company, or set
 *    `codCollected: true` to forge a cash collection, or set `customerRating`
 *    to file a rating the customer never gave.
 *
 * 2. LOST STATUS UPDATE. guardTransition proves a jump is legal from the
 *    status we READ. It says nothing about whether that status is still
 *    current. A warehouse scan and a driver-app delivery landing on the same
 *    parcel at the same moment would both pass; the later write wins, the
 *    customer is notified twice, and the linked Shipment is synced to
 *    whichever status happened to arrive last.
 *
 * Tests are written so they FAIL against the old implementation. A mass-
 * assignment test that only asserts the happy path would pass either way.
 */

const waybillRow = (over: Record<string, any> = {}) => ({
  id: 'wb-1',
  companyId: 'co-1',
  trackingNumber: 'FO26000001',
  status: 'PENDING',
  senderName: 'Sender Co',
  recipientName: 'Acme Holdings',
  ratingToken: null,
  ratingRequestedAt: null,
  customerRating: null,
  codCollected: false,
  codCollectedAmount: null,
  shipments: [],
  inboxItem: null,
  ...over,
});

/**
 * Harness that records the ACTUAL Prisma arguments rather than just the
 * outcome — the mass-assignment bug lives in what gets written, not in what
 * gets returned.
 */
function makeHarness(row: Record<string, any> = {}) {
  const db = { waybill: waybillRow(row) };
  const writes: any[] = [];
  const notifications: any[] = [];
  const audits: any[] = [];

  const prisma: any = {
    waybill: {
      findFirst: jest.fn(async ({ where }: any) =>
        db.waybill.id === where.id && (where.companyId === undefined || db.waybill.companyId === where.companyId)
          ? { ...db.waybill }
          : null,
      ),
      update: jest.fn(async ({ where, data }: any) => {
        writes.push({ kind: 'update', where, data });
        Object.assign(db.waybill, data);
        return { ...db.waybill };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const idOk = db.waybill.id === where.id;
        const tenantOk =
          where.companyId === undefined || db.waybill.companyId === where.companyId;
        const statusOk = where.status === undefined || db.waybill.status === where.status;
        const tokenOk = where.ratingToken === undefined || db.waybill.ratingToken === where.ratingToken;
        if (!idOk || !tenantOk || !statusOk || !tokenOk) {
          writes.push({ kind: 'updateMany', where, data, count: 0 });
          return { count: 0 };
        }
        Object.assign(db.waybill, data);
        writes.push({ kind: 'updateMany', where, data, count: 1 });
        return { count: 1 };
      }),
    },
    shipment: { updateMany: jest.fn(async () => ({ count: 0 })) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };

  const svc = Object.create(WaybillsService.prototype) as WaybillsService;
  Object.assign(svc as any, {
    prisma,
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    notifications: { notifyWaybillStatus: jest.fn(async (w: any) => { notifications.push(w); }) },
    ecommerce: { pushStatusToShopify: jest.fn(async () => undefined) },
    audit: { record: jest.fn(async (a: any) => { audits.push(a); }) },
  });

  return { svc, db, writes, notifications, audits };
}

describe('WaybillsService.update — tenant integrity', () => {
  it('refuses to let a caller move the waybill to another company', async () => {
    const { svc, db, writes } = makeHarness();

    await svc.update('wb-1', 'co-1', { companyId: 'co-2' });

    for (const w of writes) {
      expect(w.data.companyId).toBeUndefined();
    }
    expect(db.waybill.companyId).toBe('co-1');
  });

  it('refuses to let a caller forge a cash collection', async () => {
    const { svc, db, writes } = makeHarness({ status: 'DELIVERED' });

    await svc.update('wb-1', 'co-1', { codCollected: true, codCollectedAmount: 5000 });

    for (const w of writes) {
      expect(w.data.codCollected).toBeUndefined();
      expect(w.data.codCollectedAmount).toBeUndefined();
    }
    expect(db.waybill.codCollected).toBe(false);
  });

  it('refuses to let a caller file a customer rating', async () => {
    const { svc, db, writes } = makeHarness({ status: 'DELIVERED' });

    await svc.update('wb-1', 'co-1', { customerRating: 5, customerRatingNote: 'Great service' });

    for (const w of writes) {
      expect(w.data.customerRating).toBeUndefined();
      expect(w.data.customerRatingNote).toBeUndefined();
    }
    expect(db.waybill.customerRating).toBeNull();
  });

  it('refuses to let a caller set the rating token or identity fields', async () => {
    const { svc, db, writes } = makeHarness();

    await svc.update('wb-1', 'co-1', { ratingToken: 'forged', id: 'other-id', createdAt: new Date(0) });

    for (const w of writes) {
      expect(w.data.ratingToken).toBeUndefined();
      expect(w.data.id).toBeUndefined();
      expect(w.data.createdAt).toBeUndefined();
    }
    expect(db.waybill.ratingToken).toBeNull();
    expect(db.waybill.id).toBe('wb-1');
  });

  it('still applies the fields a caller is allowed to edit', async () => {
    const { svc, db } = makeHarness();

    await svc.update('wb-1', 'co-1', { recipientName: 'New Receiver', weight: 12.5 });

    expect(db.waybill.recipientName).toBe('New Receiver');
    expect(db.waybill.weight).toBe(12.5);
  });

  it('scopes a non-status edit to the tenant', async () => {
    const { svc, writes } = makeHarness();
    await svc.update('wb-1', 'co-1', { recipientName: 'X' });
    const tenantScoped = writes.every((w) => w.where.companyId === 'co-1');
    expect(tenantScoped).toBe(true);
  });
});

describe('WaybillsService.update — lost update', () => {
  it('lets a legal transition through and notifies once', async () => {
    const { svc, db, notifications } = makeHarness();

    await svc.update('wb-1', 'co-1', { status: 'IN_TRANSIT' });

    expect(db.waybill.status).toBe('IN_TRANSIT');
    expect(notifications).toHaveLength(1);
  });

  it('refuses when the parcel moved after we read it', async () => {
    // THE RACE. This call read PENDING and validated PENDING -> IN_TRANSIT.
    // Before it writes, a driver app delivers the parcel.
    const { svc, db, notifications } = makeHarness();

    const p = svc.update('wb-1', 'co-1', { status: 'IN_TRANSIT' });
    db.waybill.status = 'DELIVERED'; // the competing write

    await expect(p).rejects.toBeInstanceOf(ConflictException);

    // The delivery stands; we did not drag it back to IN_TRANSIT.
    expect(db.waybill.status).toBe('DELIVERED');
    // And the customer was not told their parcel is in transit after delivery.
    expect(notifications).toHaveLength(0);
  });

  it('pins the status it validated against in the WHERE clause', async () => {
    const { svc, writes } = makeHarness();
    await svc.update('wb-1', 'co-1', { status: 'IN_TRANSIT' });
    const claim = writes.find((w) => w.kind === 'updateMany' && w.where.status);
    expect(claim).toBeDefined();
    expect(claim!.where.status).toBe('PENDING');
  });
});

describe('WaybillsService.requestRating — one token, one message', () => {
  function makeRatingHarness(row: Record<string, any> = {}) {
    const base = makeHarness({ status: 'DELIVERED', ...row });
    const sent: any[] = [];
    (base.svc as any).notifications.sendRatingRequest = jest.fn(async (w: any) => {
      sent.push(w);
    });
    return { ...base, sent };
  }

  it('sends one rating request', async () => {
    const { svc, db, sent } = makeRatingHarness();
    const res: any = await svc.requestRating('wb-1', 'co-1');
    expect(res.success).toBe(true);
    expect(sent).toHaveLength(1);
    expect(db.waybill.ratingToken).toBeTruthy();
  });

  it('does not send a second SMS when the request is retried', async () => {
    const { svc, sent } = makeRatingHarness();
    await svc.requestRating('wb-1', 'co-1');
    const res: any = await svc.requestRating('wb-1', 'co-1');
    expect(sent).toHaveLength(1);
    expect(res.alreadyRequested).toBe(true);
  });

  it('loses the race when a concurrent request already minted the token', async () => {
    const { svc, db, sent } = makeRatingHarness();
    const p = svc.requestRating('wb-1', 'co-1');
    db.waybill.ratingToken = 'someone-elses-token'; // competing request
    const res: any = await p;
    // Exactly one message, and we hand back the token that actually exists.
    expect(sent).toHaveLength(0);
    expect(res.token).toBe('someone-elses-token');
  });
});
