import { withTenantMock } from '../test/tenant-prisma-mock';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CodSettlementService } from './cod-settlement.service';

/**
 * COD settlement regression tests.
 *
 * COD is cash, so the properties pinned here are the ones that protect money:
 *  - a collection can be recorded ONCE per waybill (a retry, a double tap or a
 *    concurrent request must never credit the driver twice);
 *  - the driver credited is the driver the parcel is actually assigned to, in
 *    the caller's tenant (no stale or cross-tenant mapping);
 *  - the credit, the ledger row and the waybill stamp either all happen or none
 *    of them do (one transaction);
 *  - settlement cannot overdraw the wallet, even under concurrency.
 */

type Row = Record<string, any>;

function makeHarness() {
  const db: {
    codCollected: boolean;
    wallet: Row | null;
    ledger: Row[];
    waybillClaimCount: number;
  } = { codCollected: false, wallet: { id: 'wal-1', driverId: 'drv-1', balance: 0, totalCollected: 0, totalSettled: 0 }, ledger: [], waybillClaimCount: 1 };

  const waybill: Row = {
    id: 'wb-1',
    companyId: 'co-1',
    trackingNumber: 'FO-0001',
    codAmount: 250,
    codCollected: false,
    codCollectedAmount: null,
    shipments: [{ driverId: 'drv-1', driver: { id: 'drv-1', companyId: 'co-1', isActive: true } }],
  };

  const tx = {
    // Compare-and-set: exactly one caller can flip codCollected.
    waybill: {
      updateMany: jest.fn(async () => {
        if (db.codCollected) return { count: 0 };
        db.codCollected = true;
        return { count: db.waybillClaimCount };
      }),
    },
    driverWallet: {
      upsert: jest.fn(async () => db.wallet),
      update: jest.fn(async ({ data }: any) => {
        db.wallet = {
          ...db.wallet,
          balance: db.wallet!.balance + (data.balance?.increment ?? 0),
          totalCollected: db.wallet!.totalCollected + (data.totalCollected?.increment ?? 0),
        };
        return db.wallet;
      }),
      findUnique: jest.fn(async () => db.wallet),
      findUniqueOrThrow: jest.fn(async () => db.wallet),
      // Guarded decrement: only matches while the balance still covers it.
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (!db.wallet || db.wallet.balance < where.balance.gte) return { count: 0 };
        db.wallet = {
          ...db.wallet,
          balance: db.wallet.balance - data.balance.decrement,
          totalSettled: db.wallet.totalSettled + data.totalSettled.increment,
        };
        return { count: 1 };
      }),
    },
    codTransaction: {
      findFirst: jest.fn(async ({ where }: any) => db.ledger.find((row) =>
        row.walletId === where.walletId && row.type === where.type && row.idempotencyKey === where.idempotencyKey,
      ) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const duplicate = db.ledger.find((row) => row.walletId === data.walletId && row.idempotencyKey === data.idempotencyKey);
        if (duplicate) throw Object.assign(new Error('unique constraint'), { code: 'P2002' });
        const row = { id: `ct-${db.ledger.length + 1}`, ...data };
        db.ledger.push(row);
        return row;
      }),
    },
  };

  // The waybill, billing and driver reads now happen INSIDE the tenant transaction, so
  // the tx client must expose them as well — EXTEND, never overwrite, the models the tx
  // already defines (waybill.updateMany is the compare-and-set the specs assert on).
  //
  // These DELEGATE to the outer mocks rather than returning canned values, because
  // several specs simulate a cross-tenant read by overriding prisma.<model>.findFirst.
  // A canned copy here would quietly ignore that override and the test would pass for
  // the wrong reason. The arrow functions resolve `prisma` lazily at call time.
  (tx as any).waybill = Object.assign({}, (tx as any).waybill, {
    findFirst: jest.fn(async (...args: any[]) => (prisma as any).waybill.findFirst(...args)),
  });
  (tx as any).invoiceItem = Object.assign({}, (tx as any).invoiceItem, {
    findFirst: jest.fn(async (...args: any[]) => (prisma as any).invoiceItem.findFirst(...args)),
  });
  (tx as any).driver = Object.assign({}, (tx as any).driver, {
    findFirst: jest.fn(async (...args: any[]) => (prisma as any).driver.findFirst(...args)),
    findMany: jest.fn(async (...args: any[]) => (prisma as any).driver.findMany?.(...args)),
  });
  // settleDriver now reads the wallet and the company inside the tenant tx too.
  (tx as any).driverWallet = Object.assign({}, (tx as any).driverWallet, {
    findUnique: jest.fn(async (...args: any[]) => (prisma as any).driverWallet.findUnique(...args)),
  });

  const prisma = {
    waybill: { findFirst: jest.fn(async () => waybill) },
    invoiceItem: { findFirst: jest.fn(async () => ({ id: 'ii-1', invoice: { id: 'inv-1', status: 'SENT' } })) },
    driver: { findFirst: jest.fn(async () => ({ id: 'drv-1' })) },
    driverWallet: { findUnique: jest.fn(async () => db.wallet) },
    codTransaction: {
      findFirst: jest.fn(async ({ where }: any) => db.ledger.find((row) =>
        row.walletId === where.walletId && row.type === where.type && row.idempotencyKey === where.idempotencyKey,
      ) ?? null),
      findMany: jest.fn(async () => db.ledger.filter((l) => l.type === 'COLLECTION')),
    },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  // The service now runs inside withTenant(); give the mock a faithful one and record
  // the tenant it binds so the specs can assert RLS was actually engaged.
  const tenant = withTenantMock(prisma, tx);

  const svc = new CodSettlementService(prisma as any);
  return { svc, prisma, tx, db, waybill, tenant };
}

describe('CodSettlementService.recordCollection', () => {
  it('refuses a waybill that does not exist in this tenant', async () => {
    const { svc, prisma } = makeHarness();
    (prisma.waybill.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(svc.recordCollection({ waybillId: 'wb-x', companyId: 'co-1' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('refuses a waybill with no COD amount (nothing to settle)', async () => {
    const { svc, waybill: wb } = makeHarness();
    wb.codAmount = 0;
    await expect(svc.recordCollection({ waybillId: 'wb-1', companyId: 'co-1' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses a stale driver mapping instead of crediting the wrong wallet', async () => {
    const { svc } = makeHarness();
    await expect(
      svc.recordCollection({ waybillId: 'wb-1', companyId: 'co-1', driverId: 'drv-OTHER' }),
    ).rejects.toThrow(ConflictException);
  });

  it('refuses when the assigned driver belongs to another company', async () => {
    const { svc, waybill } = makeHarness();
    waybill.shipments[0].driver.companyId = 'co-2';
    await expect(svc.recordCollection({ waybillId: 'wb-1', companyId: 'co-1' })).rejects.toThrow(
      /another company/,
    );
  });

  it('refuses when the assigned driver account is inactive', async () => {
    const { svc, waybill } = makeHarness();
    waybill.shipments[0].driver.isActive = false;
    await expect(svc.recordCollection({ waybillId: 'wb-1', companyId: 'co-1' })).rejects.toThrow(
      /inactive/,
    );
  });

  it('refuses when there is no active billing evidence for the waybill', async () => {
    const { svc, prisma } = makeHarness();
    (prisma.invoiceItem.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(svc.recordCollection({ waybillId: 'wb-1', companyId: 'co-1' })).rejects.toThrow(
      /raise the invoice before settling COD/,
    );
  });

  it('credits the wallet once and records a COLLECTION ledger row', async () => {
    const { svc, db, tx } = makeHarness();
    const result = await svc.recordCollection({ waybillId: 'wb-1', companyId: 'co-1' });

    expect(result).toMatchObject({
      collected: 250,
      owed: 250,
      discrepancy: 0,
      exact: true,
      driverId: 'drv-1',
      ledgerTransactionId: 'ct-1',
    });
    expect(db.wallet!.balance).toBe(250);
    expect(db.ledger).toHaveLength(1);
    expect(db.ledger[0]).toMatchObject({ type: 'COLLECTION', amount: 250, waybillId: 'wb-1', companyId: 'co-1' });
    // Everything happened in the one transaction.
    expect(tx.waybill.updateMany).toHaveBeenCalledTimes(1);
  });

  it('records a short collection and keeps the discrepancy on the row and note', async () => {
    const { svc, db } = makeHarness();
    const result = await svc.recordCollection({
      waybillId: 'wb-1',
      companyId: 'co-1',
      collectedAmount: 200,
    });
    expect(result).toMatchObject({ collected: 200, owed: 250, discrepancy: -50, exact: false });
    expect(db.ledger[0].note).toContain('SHORT by R50.00');
  });

  // ── The regression that matters most: no double credit ────────────────────

  it('REGRESSION: a second collection for the same waybill is refused and credits nothing', async () => {
    const { svc, db } = makeHarness();

    const first = await svc.recordCollection({ waybillId: 'wb-1', companyId: 'co-1' });
    expect(first.collected).toBe(250);

    await expect(svc.recordCollection({ waybillId: 'wb-1', companyId: 'co-1' })).rejects.toThrow(
      ConflictException,
    );

    // The wallet was credited exactly once and exactly one ledger row exists.
    expect(db.wallet!.balance).toBe(250);
    expect(db.ledger).toHaveLength(1);
  });

  it('REGRESSION: two concurrent settlements cannot both credit (CAS loser gets a 409)', async () => {
    const { svc, db } = makeHarness();

    const results = await Promise.allSettled([
      svc.recordCollection({ waybillId: 'wb-1', companyId: 'co-1' }),
      svc.recordCollection({ waybillId: 'wb-1', companyId: 'co-1' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    expect(db.wallet!.balance).toBe(250);
    expect(db.ledger).toHaveLength(1);
  });

  it('rejects a negative collected amount before any write', async () => {
    const { svc, tx } = makeHarness();
    await expect(
      svc.recordCollection({ waybillId: 'wb-1', companyId: 'co-1', collectedAmount: -5 }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.waybill.updateMany).not.toHaveBeenCalled();
  });
});

describe('CodSettlementService.settleDriver', () => {
  it('refuses a driver from another tenant', async () => {
    const { svc, prisma } = makeHarness();
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(svc.settleDriver('drv-x', 100, 'co-1', '00000000-0000-4000-8000-000000000001')).rejects.toThrow(NotFoundException);
  });

  it('refuses a settlement larger than the cash the driver holds', async () => {
    const { svc, db } = makeHarness();
    db.wallet = { id: 'wal-1', driverId: 'drv-1', balance: 50, totalCollected: 50, totalSettled: 0 };
    await expect(svc.settleDriver('drv-1', 100, 'co-1', '00000000-0000-4000-8000-000000000001')).rejects.toThrow(BadRequestException);
    // The balance is untouched by the failed attempt.
    expect(db.wallet.balance).toBe(50);
  });

  it('settles cash, decrements the balance and writes a SETTLEMENT ledger row', async () => {
    const { svc, db } = makeHarness();
    db.wallet = { id: 'wal-1', driverId: 'drv-1', balance: 300, totalCollected: 300, totalSettled: 0 };

    const result = await svc.settleDriver('drv-1', 300, 'co-1', '00000000-0000-4000-8000-000000000001', 'Banked at HQ');

    expect(result).toMatchObject({ settled: 300, newBalance: 0 });
    expect(db.ledger[0]).toMatchObject({ type: 'SETTLEMENT', amount: 300, balance: 0 });
  });

  it('returns the original settlement on an idempotent retry with a surplus balance', async () => {
    const { svc, db } = makeHarness();
    db.wallet = { id: 'wal-1', driverId: 'drv-1', balance: 600, totalCollected: 600, totalSettled: 0 };
    const key = '00000000-0000-4000-8000-000000000003';

    const first = await svc.settleDriver('drv-1', 300, 'co-1', key, 'Banked at HQ');
    const replay = await svc.settleDriver('drv-1', 300, 'co-1', key, 'Banked at HQ');

    expect(replay).toMatchObject({ ...first, replayed: true });
    expect(db.wallet!.balance).toBe(300);
    expect(db.ledger.filter((row) => row.type === 'SETTLEMENT')).toHaveLength(1);
  });

  it('rejects reusing a settlement key with a different request', async () => {
    const { svc, db } = makeHarness();
    db.wallet = { id: 'wal-1', driverId: 'drv-1', balance: 600, totalCollected: 600, totalSettled: 0 };
    const key = '00000000-0000-4000-8000-000000000004';
    await svc.settleDriver('drv-1', 300, 'co-1', key, 'Banked at HQ');

    await expect(svc.settleDriver('drv-1', 200, 'co-1', key, 'Different amount')).rejects.toThrow(ConflictException);
    expect(db.wallet!.balance).toBe(300);
    expect(db.ledger.filter((row) => row.type === 'SETTLEMENT')).toHaveLength(1);
  });

  it('two concurrent settlements with different keys cannot both spend the same cash', async () => {
    const { svc, db } = makeHarness();
    db.wallet = { id: 'wal-1', driverId: 'drv-1', balance: 300, totalCollected: 300, totalSettled: 0 };

    const results = await Promise.allSettled([
      svc.settleDriver('drv-1', 300, 'co-1', '00000000-0000-4000-8000-000000000001'),
      svc.settleDriver('drv-1', 300, 'co-1', '00000000-0000-4000-8000-000000000002'),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(db.wallet!.balance).toBe(0);
  });
});

describe('CodSettlementService.verifyConsistency', () => {
  it('reports a waybill marked collected with no ledger row as inconsistent', async () => {
    const { svc, waybill, prisma } = makeHarness();
    waybill.codCollected = true;
    (prisma.codTransaction.findMany as jest.Mock).mockResolvedValue([]);
    const result = await svc.verifyConsistency('wb-1', 'co-1');
    expect(result).toMatchObject({ consistent: false });
    expect(result.detail).toMatch(/no COLLECTION ledger row/);
  });

  it('flags a double credit when two COLLECTION rows exist', async () => {
    const { svc, waybill, prisma } = makeHarness();
    waybill.codCollected = true;
    (prisma.codTransaction.findMany as jest.Mock).mockResolvedValue([{ id: 'a', amount: 250 }, { id: 'b', amount: 250 }]);
    const result = await svc.verifyConsistency('wb-1', 'co-1');
    expect(result.detail).toMatch(/possible double credit/);
  });

  it('detects a ledger amount that disagrees with the waybill', async () => {
    const { svc, waybill, prisma } = makeHarness();
    waybill.codCollected = true;
    waybill.codCollectedAmount = 250;
    (prisma.codTransaction.findMany as jest.Mock).mockResolvedValue([{ id: 'a', amount: 200 }]);
    const result = await svc.verifyConsistency('wb-1', 'co-1');
    expect(result.detail).toMatch(/does not match waybill collected amount/);
  });

  it('is consistent after a normal collection', async () => {
    const { svc, waybill } = makeHarness();
    await svc.recordCollection({ waybillId: 'wb-1', companyId: 'co-1' });
    waybill.codCollected = true;
    waybill.codCollectedAmount = 250;
    await expect(svc.verifyConsistency('wb-1', 'co-1')).resolves.toMatchObject({ consistent: true });
  });
});
