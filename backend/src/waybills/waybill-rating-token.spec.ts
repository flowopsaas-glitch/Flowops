import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { NotFoundException } from '@nestjs/common';
import { WaybillStatus } from '@prisma/client';
import { WaybillsService } from './waybills.service';

/**
 * `Waybill.ratingToken` is the bearer token behind the customer's public rating
 * link. It reached the customer through the rating email and the dispatcher
 * through `requestRating`'s explicit `{ success, token }` - and also through
 * every row-shaped response, because Prisma's `include:` narrows relations but
 * still returns every scalar column. Anyone who can list waybills could file a
 * customer rating nobody made.
 *
 * These tests hold the line in both directions: the incidental exposure is
 * gone, and the two deliberate paths still work.
 */
const TOKEN = 'FO26000001-3f1c9a2e-0d3b-4c11-9d0f-8a2b6c4d5e6f';

const waybillRow = (over: Record<string, unknown> = {}) => ({
  id: 'wb-1',
  companyId: 'co-1',
  trackingNumber: 'FO26000001',
  status: 'PENDING',
  senderName: 'Sender Co',
  recipientName: 'Acme Holdings',
  recipientEmail: 'acme@example.com',
  ratingToken: TOKEN,
  customerRating: null,
  ...over,
});

/** WaybillsService has eight dependencies; each test below wires only what it exercises. */
const makeService = (deps: Record<string, unknown>) => {
  const svc = Object.create(WaybillsService.prototype) as WaybillsService;
  Object.assign(svc as any, { logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }, deps);
  return svc;
};

const makePrisma = (waybill: Record<string, jest.Mock>) =>
  ({ waybill, shipment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } }) as any;

describe('Waybill rating token is not served on row-shaped responses', () => {
  it('GET /waybills: the page of waybills carries no rating token', async () => {
    const prisma = makePrisma({
      findMany: jest.fn().mockResolvedValue([waybillRow(), waybillRow({ id: 'wb-2' })]),
      count: jest.fn().mockResolvedValue(2),
    });
    const res: any = await makeService({ prisma }).findAll('co-1', {});

    expect(res.total).toBe(2);
    expect(res.data).toHaveLength(2);
    for (const row of res.data) {
      expect(row).not.toHaveProperty('ratingToken');
      expect(row.trackingNumber).toBe('FO26000001');
      expect(row.recipientName).toBe('Acme Holdings');
    }
  });

  it('GET /waybills/:id: the detail response carries no rating token but still 404s cross-tenant', async () => {
    const findFirst = jest.fn().mockResolvedValue(waybillRow());
    const svc = makeService({ prisma: makePrisma({ findFirst }) });

    const one: any = await svc.findOne('wb-1', 'co-1');
    expect(one).not.toHaveProperty('ratingToken');
    expect(one.id).toBe('wb-1');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'wb-1', companyId: 'co-1' } }),
    );

    findFirst.mockResolvedValue(null);
    await expect(svc.findOne('wb-1', 'other-co')).rejects.toThrow(NotFoundException);
  });

  it('findMyDeliveries: the driver-facing active list carries no rating token', async () => {
    const prisma = makePrisma({
      findMany: jest.fn().mockResolvedValue([waybillRow()]),
    });
    prisma.driver = { findFirst: jest.fn().mockResolvedValue(null) };

    const rows: any = await makeService({ prisma }).findMyDeliveries('usr-1', 'co-1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('ratingToken');
    expect(rows[0].id).toBe('wb-1');
  });

  it('findRecent: the API-key feed (GET /public/v1/waybills) carries no rating token', async () => {
    const prisma = makePrisma({ findMany: jest.fn().mockResolvedValue([waybillRow()]) });

    const rows: any = await makeService({ prisma }).findRecent('co-1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('ratingToken');
    expect(rows[0].trackingNumber).toBe('FO26000001');
  });

  it('create: the response is redacted but the notification fan-out still gets the real row', async () => {
    const notifyWaybillStatus = jest.fn().mockResolvedValue(undefined);
    const prisma = makePrisma({
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue(waybillRow()),
    });

    const created: any = await makeService({
      prisma,
      billing: { assertCanCreate: jest.fn().mockResolvedValue(undefined) },
      notifications: { notifyWaybillStatus },
    }).create('co-1', { recipientName: 'Acme Holdings' });

    expect(created).not.toHaveProperty('ratingToken');
    expect(created.trackingNumber).toBe('FO26000001');
    // Redaction is response-side only: the row handed to notifications is raw.
    expect(notifyWaybillStatus.mock.calls[0][0].ratingToken).toBe(TOKEN);
  });

  it('update: a legal status change is redacted on the way out, raw on the way to notifications', async () => {
    const notifyWaybillStatus = jest.fn().mockResolvedValue(undefined);
    const pushStatusToShopify = jest.fn().mockResolvedValue(undefined);
    const prisma = makePrisma({
      findFirst: jest.fn().mockResolvedValue(waybillRow()),
      update: jest.fn().mockResolvedValue(waybillRow({ status: 'COLLECTED' })),
    });

    const updated: any = await makeService({
      prisma,
      notifications: { notifyWaybillStatus },
      ecommerce: { pushStatusToShopify },
    }).update('wb-1', 'co-1', { status: 'COLLECTED' });

    expect(updated).not.toHaveProperty('ratingToken');
    expect(updated.status).toBe('COLLECTED');
    expect(notifyWaybillStatus.mock.calls[0][0].ratingToken).toBe(TOKEN);
    expect(pushStatusToShopify.mock.calls[0][0].ratingToken).toBe(TOKEN);
  });

  describe('the two deliberate paths still issue the token', () => {
    it('requestRating answers with the explicit { success, token } and emails the link', async () => {
      const sendRatingRequest = jest.fn().mockResolvedValue(undefined);
      const prisma = makePrisma({
        findFirst: jest.fn().mockResolvedValue(waybillRow({ status: 'DELIVERED' })),
        // The service mints a fresh token and stores it; mirror that so the
        // assertion below checks the token that was actually written.
        update: jest.fn().mockImplementation(async (args: any) =>
          waybillRow({ status: 'DELIVERED', ratingToken: args.data.ratingToken }),
        ),
      });

      const res: any = await makeService({
        prisma,
        notifications: { sendRatingRequest },
      }).requestRating('wb-1', 'co-1');

      expect(res.success).toBe(true);
      expect(typeof res.token).toBe('string');
      expect(res.token.length).toBeGreaterThan(0);
      // The customer-facing email is built from the real token.
      expect(sendRatingRequest.mock.calls[0][0].ratingToken).toBe(res.token);
    });

    it('refuses to request a rating before delivery', async () => {
      const prisma = makePrisma({
        findFirst: jest.fn().mockResolvedValue(waybillRow({ status: 'PENDING' })),
        update: jest.fn(),
      });
      await expect(
        makeService({ prisma, notifications: { sendRatingRequest: jest.fn() } }).requestRating(
          'wb-1',
          'co-1',
        ),
      ).rejects.toThrow(/after delivery/);
      expect(prisma.waybill.update).not.toHaveBeenCalled();
    });
  });

  it('recordDelivery notifies with the raw row and redacts only its response', () => {
    /**
     * `recordDelivery` uploads POD media, notifies the customer, pushes to
     * Shopify and then answers. The ordering matters: if the stripped copy were
     * handed to the notification fan-out, the rating link would silently
     * disappear from delivery emails. Pin the order rather than build a
     * nine-dependency upload harness for it.
     */
    const source = fs.readFileSync(path.join(__dirname, 'waybills.service.ts'), 'utf8');
    const notifyAt = source.indexOf('void this.notifications.notifyWaybillStatus(delivered);');
    const returnAt = source.indexOf('return withoutRatingToken(delivered);');

    expect(notifyAt).toBeGreaterThan(-1);
    expect(returnAt).toBeGreaterThan(-1);
    expect(notifyAt).toBeLessThan(returnAt);
    expect(source).not.toMatch(/notifyWaybillStatus\(withoutRatingToken/);
    expect(source).not.toMatch(/pushStatusToShopify\(withoutRatingToken/);
  });

  it('the public rating lookup never selects the token into its response', () => {
    const source = fs.readFileSync(path.join(__dirname, 'waybills.service.ts'), 'utf8');
    const publicRating = source.slice(
      source.indexOf('async getPublicRating('),
      source.indexOf('async submitRating('),
    );
    expect(publicRating).toMatch(/select: \{/);
    expect(publicRating).not.toMatch(/ratingToken: true/);
  });

  it('leaves the enum-driven status list alone (regression guard on the import)', () => {
    expect(WaybillStatus.COLLECTED).toBe('COLLECTED');
  });
});
