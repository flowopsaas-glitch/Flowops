import * as crypto from 'crypto';
import { EcommerceService } from './ecommerce.service';

/**
 * E-COMMERCE — Shopify / WooCommerce orders becoming waybills.
 *
 * Two defects, both in order intake, both silent:
 *
 *   1. Idempotency matched on a bare `shopify:<id>` substring. Shopify order
 *      ids are numeric, so order 12 collided with order 123 — a retry of 12
 *      arriving after 123 had landed was skipped as a duplicate and the order
 *      was lost. That is the duplicate check firing exactly when it should not.
 *
 *   2. `trackingNumber` is unique per company but derived from `count() + 1`,
 *      so two orders landing together computed the same number and the second
 *      insert raised P2002. Unhandled, a burst of webhooks became a 500 and a
 *      lost order.
 *
 * The signature verification was already correct — it fails closed when no
 * secret is configured — and that is locked in here too.
 */

const COMPANY = 'co-1';
const VICTIM = 'co-2';
const SECRET = 'whsec_test_secret';

const matches = (row: any, where: any) =>
  Object.entries(where ?? {}).every(([k, v]) => (v === undefined ? true : row[k] === v));

const containsMatch = (value: string | null | undefined, needle: any) =>
  typeof value === 'string' && typeof needle === 'string' && value.includes(needle);

function makeHarness(opts: { entitled?: boolean } = {}) {
  const waybills: any[] = [];
  let seq = 0;
  let raceHook: (() => void) | null = null;

  const waybill = {
    create: jest.fn(async ({ data }: any) => {
      // Mirrors @@unique([trackingNumber, companyId]).
      if (waybills.some((w) => w.trackingNumber === data.trackingNumber && w.companyId === data.companyId)) {
        const err: any = new Error('Unique constraint failed on the fields: (`trackingNumber`,`companyId`)');
        err.code = 'P2002';
        throw err;
      }
      // Simulate a concurrent request winning the same number.
      if (raceHook) {
        const hook = raceHook;
        raceHook = null;
        hook();
        const err: any = new Error('Unique constraint failed');
        err.code = 'P2002';
        throw err;
      }
      const row = { id: `wb-${++seq}`, ...data };
      waybills.push(row);
      return { ...row };
    }),
    count: jest.fn(async ({ where }: any) => waybills.filter((w) => matches(w, where)).length),
    findFirst: jest.fn(async ({ where }: any) => {
      // `description: { contains }` is an operator object, not a value to
      // compare — strip it before the generic term-by-term match and apply it
      // separately, the way Prisma would.
      const { description, ...rest } = where ?? {};
      const found = waybills.find((w) => {
        if (!matches(w, rest)) return false;
        if (description && typeof description === 'object' && 'contains' in description) {
          return containsMatch(w.description, description.contains);
        }
        return true;
      });
      return found ?? null;
    }),
  };

  const company = { findMany: jest.fn(async () => [{ id: COMPANY }, { id: VICTIM }]) };

  const prisma: any = { waybill, company, __waybills: waybills };
  const config: any = { get: jest.fn((_k: string, d?: any) => d) };
  const billing: any = { hasFeature: jest.fn(async () => opts.entitled !== false) };
  const creds: any = {
    resolveCompanyByRef: jest.fn(async () => null),
    getDecrypted: jest.fn(async () => null),
  };

  return {
    prisma,
    billing,
    creds,
    svc: new EcommerceService(prisma, config, billing, creds),
    /** Make the next create() fail as though another request took the number. */
    collideOnce: (winner?: any) => {
      raceHook = () => {
        if (winner) waybills.push(winner);
      };
    },
  };
}

const shopifyOrder = (over: any = {}) => ({
  id: 123, order_number: 1001, total_price: '250.00',
  shipping_address: { first_name: 'Thabo', last_name: 'Mokoena', address1: '1 Main Rd', city: 'Joburg', phone: '0820000000' },
  customer: { first_name: 'Thabo' },
  line_items: [{ grams: 500, quantity: 2 }],
  ...over,
});

const wooOrder = (over: any = {}) => ({
  id: 123, number: 1001, total: '250.00',
  shipping: { first_name: 'Thabo', last_name: 'Mokoena', address_1: '1 Main Rd', city: 'Joburg' },
  billing: { phone: '0820000000' },
  line_items: [{ weight: 1.5, quantity: 2 }],
  ...over,
});

describe('EcommerceService — order intake', () => {
  it('creates a waybill from a Shopify order', async () => {
    const h = makeHarness();
    const out: any = await h.svc.processShopifyOrder(shopifyOrder(), COMPANY);

    expect(out.status).toEqual('created');
    expect(h.prisma.__waybills[0].description).toContain('shopify:123');
    expect(h.prisma.__waybills[0].recipientName).toEqual('Thabo Mokoena');
    expect(h.prisma.__waybills[0].companyId).toEqual(COMPANY);
  });

  it('reports a duplicate when the same order arrives twice', async () => {
    const h = makeHarness();
    await h.svc.processShopifyOrder(shopifyOrder(), COMPANY);

    const out: any = await h.svc.processShopifyOrder(shopifyOrder(), COMPANY);

    expect(out.status).toEqual('duplicate');
    expect(h.prisma.__waybills).toHaveLength(1);
  });

  it('does not mistake a shorter order id for a longer one', async () => {
    // FAILED BEFORE: the marker was a bare `shopify:12`, which is a substring of
    // `shopify:123 #1001`. Order 12 arriving after 123 — a retry, or a backfill
    // processed out of order — was skipped as a duplicate and silently lost.
    const h = makeHarness();
    await h.svc.processShopifyOrder(shopifyOrder({ id: 123 }), COMPANY);

    const out: any = await h.svc.processShopifyOrder(shopifyOrder({ id: 12 }), COMPANY);

    expect(out.status).toEqual('created');
    expect(h.prisma.__waybills).toHaveLength(2);
  });

  it('does not mistake a shorter WooCommerce id for a longer one', async () => {
    const h = makeHarness();
    await h.svc.processWooCommerceOrder(wooOrder({ id: 123 }), COMPANY);

    const out: any = await h.svc.processWooCommerceOrder(wooOrder({ id: 12 }), COMPANY);

    expect(out.status).toEqual('created');
    expect(h.prisma.__waybills).toHaveLength(2);
  });

  it('ignores orders for a tenant without the entitlement', async () => {
    const h = makeHarness({ entitled: false });
    const out: any = await h.svc.processShopifyOrder(shopifyOrder(), COMPANY);
    expect(out.status).toEqual('feature_disabled');
    expect(h.prisma.__waybills).toHaveLength(0);
  });

  it('scopes the duplicate check to the caller', async () => {
    const h = makeHarness();
    h.prisma.__waybills.push({
      id: 'wb-other', companyId: VICTIM, description: 'shopify:123 #1001', trackingNumber: 'x',
    });

    const out: any = await h.svc.processShopifyOrder(shopifyOrder(), COMPANY);

    expect(out.status).toEqual('created');
  });
});

describe('EcommerceService — tracking-number collisions', () => {
  it('takes a fresh number when another request claimed the first', async () => {
    // FAILED BEFORE: P2002 propagated out of processShopifyOrder, so an
    // ordinary burst of webhooks returned a 500 and lost the order.
    const h = makeHarness();
    h.collideOnce();

    const out: any = await h.svc.processShopifyOrder(shopifyOrder(), COMPANY);

    expect(out.status).toEqual('created');
    expect(h.prisma.waybill.create).toHaveBeenCalledTimes(2);
  });

  it('reports a duplicate when the same order won the race', async () => {
    const h = makeHarness();
    // The concurrent winner lands between our insert failing and the re-check.
    h.collideOnce({ id: 'wb-win', companyId: COMPANY, description: 'shopify:123 #1001', trackingNumber: 'FO26000001' });

    const out: any = await h.svc.processShopifyOrder(shopifyOrder(), COMPANY);

    expect(out.status).toEqual('duplicate');
    expect(out.waybillId).toEqual('wb-win');
  });

  it('rethrows anything that is not a unique violation', async () => {
    const h = makeHarness();
    h.prisma.waybill.create.mockRejectedValueOnce(new Error('connection lost'));
    await expect(h.svc.processShopifyOrder(shopifyOrder(), COMPANY)).rejects.toThrow('connection lost');
  });
});

describe('EcommerceService — webhook signature verification', () => {
  const body = Buffer.from('{"id":123}');
  const sign = (secret: string) => crypto.createHmac('sha256', secret).update(body).digest('base64');

  it('accepts a correctly signed Shopify payload', async () => {
    const h = makeHarness();
    h.creds.getDecrypted.mockResolvedValue({ config: {}, secrets: { webhookSecret: SECRET } });
    expect(await h.svc.verifyShopifySignature(body, sign(SECRET), COMPANY)).toBe(true);
  });

  it('rejects a wrongly signed Shopify payload', async () => {
    const h = makeHarness();
    h.creds.getDecrypted.mockResolvedValue({ config: {}, secrets: { webhookSecret: SECRET } });
    expect(await h.svc.verifyShopifySignature(body, sign('other-secret'), COMPANY)).toBe(false);
  });

  it.each([
    ['shopify', 'verifyShopifySignature'],
    ['woocommerce', 'verifyWooCommerceSignature'],
  ])('fails closed for %s when no secret is configured', async (_p, method) => {
    // No secret means no way to trust the payload. This already behaved
    // correctly; it is asserted so it stays that way.
    const h = makeHarness();
    h.creds.getDecrypted.mockResolvedValue(null);
    const out = await (h.svc as any)[method](body, sign(SECRET), COMPANY);
    expect(out).toBe(false);
  });

  it.each([
    ['shopify', 'verifyShopifySignature'],
    ['woocommerce', 'verifyWooCommerceSignature'],
  ])('rejects %s payloads carrying no signature', async (_p, method) => {
    const h = makeHarness();
    h.creds.getDecrypted.mockResolvedValue({ config: {}, secrets: { webhookSecret: SECRET } });
    expect(await (h.svc as any)[method](body, '', COMPANY)).toBe(false);
  });
});
