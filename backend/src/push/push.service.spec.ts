import { PushService } from './push.service';

/**
 * PUSH — driver web-push subscriptions.
 *
 * saveSubscription records driverId and companyId on the row. removeSubscription
 * deleted by endpoint alone. The endpoint is @unique and genuinely hard to
 * guess, which is what the audit exemption says — but that is not the point,
 * because the unsubscribe route never asks who is calling. An authenticated
 * driver can hand it any endpoint string and delete a colleague's subscription,
 * which stops that colleague receiving job assignments.
 */

const COMPANY = 'co-1';
const OTHER = 'co-2';
const DRIVER_A = 'drv-a';
const DRIVER_B = 'drv-b';

function makePrisma(seed: any[] = []) {
  const subs: any[] = seed.map((s) => ({ ...s }));

  const driverPushSubscription = {
    upsert: jest.fn(async ({ where, create, update }: any) => {
      const found = subs.find((s) => s.endpoint === where.endpoint);
      if (found) {
        Object.assign(found, update);
        return { ...found };
      }
      const row = { id: `sub-${subs.length + 1}`, ...create };
      subs.push(row);
      return { ...row };
    }),
    deleteMany: jest.fn(async ({ where }: any) => {
      // Prisma semantics: every clause in the WHERE must match.
      const before = subs.length;
      const keep = subs.filter((s) => {
        if (where.endpoint !== undefined && s.endpoint !== where.endpoint) return true;
        if (where.driverId !== undefined && s.driverId !== where.driverId) return true;
        if (where.companyId !== undefined && s.companyId !== where.companyId) return true;
        return false;
      });
      const removed = subs.length - (subs.length - (before - keep.length));
      subs.length = 0;
      subs.push(...keep);
      return { count: removed };
    }),
    findMany: jest.fn(async ({ where }: any) =>
      subs.filter((s) => {
        if (where.driverId !== undefined && s.driverId !== where.driverId) return false;
        if (where.companyId !== undefined && s.companyId !== where.companyId) return false;
        return true;
      }),
    ),
  };

  return {
    driverPushSubscription,
    __subs: subs,
    prisma: { driverPushSubscription } as any,
  };
}

const build = (prisma: any, vapid = true) => {
  const config: any = {
    get: jest.fn((k: string) => {
      if (!vapid) return undefined;
      if (k === 'VAPID_PUBLIC_KEY') return 'public-key';
      if (k === 'VAPID_PRIVATE_KEY') return 'private-key';
      if (k === 'VAPID_SUBJECT') return 'mailto:ops@flowop.work';
      return undefined;
    }),
  };
  return new PushService(config, prisma);
};

const sub = (over: any = {}) => ({
  driverId: DRIVER_A,
  companyId: COMPANY,
  endpoint: 'https://push.example/abc',
  p256dh: 'p256dh',
  auth: 'auth',
  ...over,
});

describe('PushService — a driver may only remove their own subscription', () => {
  it('removes the calling driver’s own subscription', async () => {
    const h = makePrisma([sub()]);
    const out: any = await build(h.prisma).removeSubscription(DRIVER_A, COMPANY, 'https://push.example/abc');
    expect(out.ok).toBe(true);
    expect(h.__subs).toHaveLength(0);
  });

  it('cannot remove another driver’s subscription', async () => {
    // FAILED BEFORE: deleteMany({ where: { endpoint } }) with no driverId. The
    // route is authenticated, but it authenticated *a* driver, not the owner of
    // the endpoint — so any driver could delete any other's subscription and
    // quietly stop them being notified of job assignments.
    const h = makePrisma([
      sub({ driverId: DRIVER_A, endpoint: 'https://push.example/a' }),
      sub({ driverId: DRIVER_B, endpoint: 'https://push.example/b' }),
    ]);
    await build(h.prisma).removeSubscription(DRIVER_A, COMPANY, 'https://push.example/b');

    // Both survive: A's own subscription was never targeted, and B's is not
    // A's to remove. (The first version of this assertion asserted the
    // opposite of what the test name says — worth the note, because it would
    // have passed against a correct implementation for the wrong reason.)
    expect(h.__subs.map((s: any) => s.driverId)).toEqual([DRIVER_A, DRIVER_B]);
  });

  it('cannot remove a subscription from another tenant', async () => {
    const h = makePrisma([
      sub({ driverId: DRIVER_A, companyId: COMPANY, endpoint: 'https://push.example/a' }),
      sub({ driverId: DRIVER_A, companyId: OTHER, endpoint: 'https://push.example/other' }),
    ]);
    await build(h.prisma).removeSubscription(DRIVER_A, COMPANY, 'https://push.example/other');

    expect(h.__subs).toHaveLength(2);
  });

  it('is harmless when the endpoint does not exist', async () => {
    const h = makePrisma([sub()]);
    await build(h.prisma).removeSubscription(DRIVER_A, COMPANY, 'https://push.example/nope');
    expect(h.__subs).toHaveLength(1);
  });
});

describe('PushService — saving subscriptions', () => {
  it('records the driver and tenant the subscription belongs to', async () => {
    const h = makePrisma();
    await build(h.prisma).saveSubscription(DRIVER_A, COMPANY, {
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'p', auth: 'a' },
    });
    expect(h.__subs[0]).toMatchObject({ driverId: DRIVER_A, companyId: COMPANY });
  });

  it('refreshes an existing subscription in place', async () => {
    const h = makePrisma([sub()]);
    await build(h.prisma).saveSubscription(DRIVER_A, COMPANY, {
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'new', auth: 'new' },
    });
    expect(h.__subs).toHaveLength(1);
    expect(h.__subs[0].p256dh).toEqual('new');
  });

  it('refuses a malformed subscription', async () => {
    const h = makePrisma();
    await expect(build(h.prisma).saveSubscription(DRIVER_A, COMPANY, {} as any)).rejects.toThrow();
    expect(h.__subs).toHaveLength(0);
  });

  it('reports disabled when VAPID keys are absent', () => {
    expect(build(makePrisma().prisma, false).enabled).toBe(false);
    expect(build(makePrisma().prisma, true).enabled).toBe(true);
  });

  it('returns no public key when push is disabled', () => {
    expect(build(makePrisma().prisma, false).getPublicKey()).toBeNull();
  });
});
