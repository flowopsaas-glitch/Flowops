import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import { OwnerService } from './owner.service';

/**
 * A plan-upgrade request is a single decision with money attached: approving
 * it moves the tenant onto a paid tier and clears their trial. Two decisions
 * must never both land.
 *
 * The bug this pins: approve and decline each read the request, checked
 * `status !== 'PENDING'`, then wrote by id. Two operators in the owner console
 * at the same moment would both pass that check — one upgrading the plan and
 * the other stamping the request REJECTED. The tenant would end up on a paid
 * plan that our own records say we declined, the audit trail would disagree
 * with the invoice, and the approval email would go out anyway.
 *
 * Reads do not hold under concurrency; the conditional UPDATE does. Each test
 * below drives two calls that have BOTH already seen PENDING.
 */

const OWNER_ACTOR = { id: 'own-1', email: 'owner@flowops.co.za' } as any;

const requestRow = (over: Record<string, any> = {}) => ({
  id: 'req-1',
  companyId: 'cmp-1',
  currentPlan: 'starter',
  requestedPlan: 'growth',
  status: 'PENDING',
  company: { id: 'cmp-1', name: 'Mokoena Freight', email: 'billing@mokoena.co.za', plan: 'starter' },
  ...over,
});

type Harness = {
  svc: OwnerService;
  db: { request: any; companyPlan: string | null; trialEndsAt: string | null };
  audit: { calls: any[] };
  email: { sent: any[] };
  /** Force the NEXT claim to see a request that has already been decided. */
  flipTo: (status: string) => void;
};

function makeHarness(start: Record<string, any> = {}): Harness {
  const db = {
    request: requestRow(start),
    companyPlan: 'starter' as string | null,
    trialEndsAt: 'trial-active' as string | null,
  };
  const audit = { calls: [] as any[] };
  const email = { sent: [] as any[] };

  const prisma: any = {
    planUpgradeRequest: {
      findUniqueOrThrow: jest.fn(async () => ({ ...db.request })),
      findUnique: jest.fn(async () => ({ ...db.request })),
      // The guard under test. Evaluated against the CURRENT row, so a
      // concurrent decision is visible to the second writer.
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (where.id !== db.request.id) return { count: 0 };
        if (where.status && db.request.status !== where.status) return { count: 0 };
        Object.assign(db.request, data);
        return { count: 1 };
      }),
    },
    company: {
      update: jest.fn(async ({ data }: any) => {
        db.companyPlan = data.plan;
        db.trialEndsAt = data.trialEndsAt;
        return { id: 'cmp-1', ...data };
      }),
    },
    aiEvent: { updateMany: jest.fn(async () => ({ count: 1 })) },
    // Behaves like the real interactive transaction: a throw inside rolls the
    // in-memory writes back, so the atomicity assertions mean something.
    $transaction: jest.fn(async (fn: any) => {
      const snap = { ...db.request };
      const planSnap = db.companyPlan;
      const trialSnap = db.trialEndsAt;
      const auditSnap = audit.calls.length;
      try {
        return await fn(prisma);
      } catch (err) {
        db.request = snap;
        db.companyPlan = planSnap;
        db.trialEndsAt = trialSnap;
        audit.calls.length = auditSnap;
        throw err;
      }
    }),
  };

  const svc = Object.create(OwnerService.prototype) as OwnerService;
  (svc as any).prisma = prisma;
  (svc as any).audit = { record: jest.fn(async (a: any) => { audit.calls.push(a); }) };
  (svc as any).email = {
    send: jest.fn(async (m: any) => { email.sent.push(m); return true; }),
  };

  return {
    svc,
    db,
    audit,
    email,
    flipTo: (status: string) => { db.request.status = status; },
  };
}

describe('OwnerService plan-upgrade decisions', () => {
  describe('approveUpgradeRequest', () => {
    it('upgrades the plan, stamps the request and notifies the tenant once', async () => {
      const { svc, db, audit, email } = makeHarness();

      const res: any = await svc.approveUpgradeRequest('req-1', OWNER_ACTOR);

      expect(db.request.status).toBe('APPROVED');
      expect(db.companyPlan).toBe('growth');
      expect(db.trialEndsAt).toBeNull();
      expect(audit.calls).toHaveLength(1);
      expect(email.sent).toHaveLength(1);
      expect(res.message).toMatch(/approved/i);
    });

    it('refuses a request that was already decided before it started', async () => {
      const { svc, db, email } = makeHarness({ status: 'APPROVED' });

      await expect(svc.approveUpgradeRequest('req-1', OWNER_ACTOR)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(db.companyPlan).toBe('starter');
      expect(email.sent).toHaveLength(0);
    });

    it('loses the race when a concurrent decline decides first', async () => {
      // THE BUG. This call has already read PENDING. Before it claims the row,
      // another operator's decline lands.
      const { svc, db, audit, email, flipTo } = makeHarness();

      const p = svc.approveUpgradeRequest('req-1', OWNER_ACTOR);
      flipTo('REJECTED'); // the competing decision
      await expect(p).rejects.toBeInstanceOf(ConflictException);

      // No plan upgrade, no audit row, and critically no "you're approved"
      // email for a request that now reads REJECTED.
      expect(db.companyPlan).toBe('starter');
      expect(db.trialEndsAt).toBe('trial-active');
      expect(audit.calls).toHaveLength(0);
      expect(email.sent).toHaveLength(0);
    });

    it('sends one approval email when two approvals race', async () => {
      const { svc, db, audit, email } = makeHarness();

      const a = svc.approveUpgradeRequest('req-1', OWNER_ACTOR);
      const b = svc.approveUpgradeRequest('req-1', OWNER_ACTOR);
      const results = await Promise.allSettled([a, b]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled).toHaveLength(1);
      expect(audit.calls).toHaveLength(1);
      expect(email.sent).toHaveLength(1);
      expect(db.request.status).toBe('APPROVED');
    });
  });

  describe('declineUpgradeRequest', () => {
    it('stamps the request rejected and leaves the plan alone', async () => {
      const { svc, db } = makeHarness();

      await svc.declineUpgradeRequest('req-1', 'Out of budget', OWNER_ACTOR);

      expect(db.request.status).toBe('REJECTED');
      expect(db.request.decisionNote).toBe('Out of budget');
      expect(db.companyPlan).toBe('starter'); // untouched — no upgrade
    });

    it('loses the race when a concurrent approval decides first', async () => {
      const { svc, db } = makeHarness();

      const p = svc.declineUpgradeRequest('req-1', 'Later', OWNER_ACTOR);
      db.request.status = 'APPROVED'; // the competing approval lands mid-flight
      await expect(p).rejects.toBeInstanceOf(ConflictException);

      // The approval stands; the decline did not overwrite it.
      expect(db.request.status).toBe('APPROVED');
    });
  });
});
