import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DigitalPaymentsService } from './digital-payments.service';
import { PaymentMethod } from './dto/digital-payment.dto';

/**
 * DIGITAL PAYMENTS — money integrity.
 *
 * This module had no tests while moving money: create, confirm, fail, refund and
 * a revenue total. Every test below was written to FAIL against the code as it
 * stood, and the commit that fixes them records which ones failed and how.
 *
 * The shape of the bugs here is the same one the platform already solved
 * elsewhere and then did not apply here:
 *   - a state machine enforced by a read, not by the WHERE clause;
 *   - money handled as a raw float, with no rounding at the boundary.
 */

const COMPANY = 'co-1';
const OTHER = 'co-2';

interface Row {
  id: string;
  companyId: string;
  amount: number;
  currency: string;
  method: string;
  status: string;
  reference: string;
  externalId?: string | null;
  paidAt?: Date | null;
  waybillId?: string | null;
  driverId?: string | null;
  createdAt: Date;
}

function makePrisma() {
  const rows: Row[] = [];
  let seq = 0;
  const tenants: string[] = [];

  const matchWhere = (row: Row, where: any): boolean => {
    for (const [k, v] of Object.entries(where ?? {})) {
      if (v === undefined) continue;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        if ('not' in v && (row as any)[k] === v.not) return false;
        if ('in' in v && !(v.in as any[]).includes((row as any)[k])) return false;
        if ('not' in v || 'in' in v) continue;
      }
      if ((row as any)[k] !== v) return false;
    }
    return true;
  };

  const model = {
    create: jest.fn(async ({ data }: any) => {
      const row: Row = {
        id: `pay-${++seq}`,
        createdAt: new Date(),
        status: 'PENDING',
        currency: 'ZAR',
        ...data,
      };
      rows.push(row);
      return { ...row };
    }),
    findFirst: jest.fn(async ({ where }: any) => {
      const hit = rows.find((r) => matchWhere(r, where));
      return hit ? { ...hit } : null;
    }),
    findMany: jest.fn(async ({ where }: any) =>
      rows.filter((r) => matchWhere(r, where)).map((r) => ({ ...r })),
    ),
    findUnique: jest.fn(async ({ where }: any) => {
      const hit = rows.find((r) => r.id === where.id);
      return hit ? { ...hit } : null;
    }),
    findUniqueOrThrow: jest.fn(async ({ where }: any) => {
      const hit = rows.find((r) => r.id === where.id);
      if (!hit) throw new Error('not found');
      return { ...hit };
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      let n = 0;
      for (const r of rows) {
        if (matchWhere(r, where)) {
          Object.assign(r, data);
          n += 1;
        }
      }
      return { count: n };
    }),
    count: jest.fn(async ({ where }: any) => rows.filter((r) => matchWhere(r, where)).length),
    aggregate: jest.fn(async ({ where }: any) => {
      const sum = rows.filter((r) => matchWhere(r, where)).reduce((a, r) => a + r.amount, 0);
      return { _sum: { amount: sum } };
    }),
  };

  const prisma: any = {
    digitalPayment: model,
    withTenant: jest.fn(async (companyId: string, fn: any) => {
      tenants.push(companyId);
      return fn(prisma);
    }),
    __rows: rows,
    __tenants: tenants,
  };
  return prisma;
}

const build = (prisma: any) => new DigitalPaymentsService(prisma);

const seed = (prisma: any, over: Partial<Row> = {}) => {
  const row: Row = {
    id: 'pay-1',
    companyId: COMPANY,
    amount: 100,
    currency: 'ZAR',
    method: PaymentMethod.CARD,
    status: 'PENDING',
    reference: 'PAY-AAAAAA',
    createdAt: new Date(),
    ...over,
  };
  prisma.__rows.push(row);
  return row;
};

describe('DigitalPaymentsService — state machine', () => {
  it('refuses to confirm a payment that already FAILED', async () => {
    // FAILED BEFORE: confirmPayment only rejected status === 'SUCCESS', so the
    // claim `status: { not: 'SUCCESS' }` matched FAILED and flipped it to SUCCESS.
    // A payment the gateway rejected could be marked paid by a second call, and
    // then counted as revenue.
    const prisma = makePrisma();
    seed(prisma, { status: 'FAILED', reference: 'PAY-FAILED' });

    await expect(
      build(prisma).confirmPayment(COMPANY, { reference: 'PAY-FAILED' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses to confirm a payment that was REFUNDED', async () => {
    // FAILED BEFORE: same cause. Money that had been paid back out reappeared as
    // a successful payment and re-entered totalRevenue.
    const prisma = makePrisma();
    seed(prisma, { status: 'REFUNDED', reference: 'PAY-REFUNDED' });

    await expect(
      build(prisma).confirmPayment(COMPANY, { reference: 'PAY-REFUNDED' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('still confirms a PENDING payment', async () => {
    const prisma = makePrisma();
    seed(prisma, { status: 'PENDING', reference: 'PAY-OK' });

    const out = await build(prisma).confirmPayment(COMPANY, {
      reference: 'PAY-OK',
      externalId: 'gw-1',
    });
    expect(out.status).toBe('SUCCESS');
    expect(out.externalId).toBe('gw-1');
  });

  it('refuses a second confirm of the same payment', async () => {
    const prisma = makePrisma();
    seed(prisma, { status: 'SUCCESS', reference: 'PAY-ONCE' });

    await expect(
      build(prisma).confirmPayment(COMPANY, { reference: 'PAY-ONCE' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a second refund', async () => {
    // Sequential case: the read sees status REFUNDED and rejects. This is the
    // common path and it is caught by the status check, not by the claim.
    const prisma = makePrisma();
    seed(prisma, { status: 'SUCCESS' });

    await build(prisma).refundPayment('pay-1', COMPANY);
    await expect(build(prisma).refundPayment('pay-1', COMPANY)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.__rows[0].status).toBe('REFUNDED');
  });

  it('loses the race cleanly when a concurrent refund already won', async () => {
    // The case the status check CANNOT catch: both callers read SUCCESS before
    // either writes. Only the WHERE decides it. Force the claim to match zero
    // rows — exactly what a lost race looks like — and require a 409 rather
    // than a silent success.
    const prisma = makePrisma();
    seed(prisma, { status: 'SUCCESS' });
    prisma.digitalPayment.updateMany.mockResolvedValue({ count: 0 });

    await expect(build(prisma).refundPayment('pay-1', COMPANY)).rejects.toThrow(
      ConflictException,
    );
  });

  it('refuses to refund a payment that is not SUCCESS', async () => {
    const prisma = makePrisma();
    seed(prisma, { status: 'PENDING' });
    await expect(build(prisma).refundPayment('pay-1', COMPANY)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('cannot confirm, fail or refund another tenant’s payment', async () => {
    const prisma = makePrisma();
    seed(prisma, { status: 'PENDING', reference: 'PAY-X' });
    seed(prisma, { id: 'pay-2', companyId: OTHER, status: 'SUCCESS', reference: 'PAY-Y' });

    await expect(build(prisma).confirmPayment(COMPANY, { reference: 'PAY-Y' })).rejects.toThrow(
      NotFoundException,
    );
    await expect(build(prisma).refundPayment('pay-2', COMPANY)).rejects.toThrow(
      NotFoundException,
    );
    await expect(build(prisma).findOne('pay-2', COMPANY)).rejects.toThrow(NotFoundException);
  });
});

describe('DigitalPaymentsService — money', () => {
  it('stores the amount rounded to cents, not a raw float', async () => {
    // FAILED BEFORE: `amount` went straight into the row. 10.005 was stored as
    // 10.005, and the platform already has Money.round for exactly this.
    const prisma = makePrisma();
    await build(prisma).createPayment(COMPANY, {
      amount: 10.005,
      method: PaymentMethod.CARD,
    });
    expect(prisma.__rows[0].amount).toBe(10.01);
  });

  it('rejects a zero or negative amount', async () => {
    const prisma = makePrisma();
    await expect(
      build(prisma).createPayment(COMPANY, { amount: 0, method: PaymentMethod.CARD }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      build(prisma).createPayment(COMPANY, { amount: -5, method: PaymentMethod.CARD }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an amount that rounds to nothing', async () => {
    // 0.004 rounds to 0.00. Accepting it would record a payment for zero money.
    // FAILED BEFORE: `amount <= 0` was false for 0.004, so it was accepted.
    const prisma = makePrisma();
    await expect(
      build(prisma).createPayment(COMPANY, { amount: 0.004, method: PaymentMethod.CARD }),
    ).rejects.toThrow(BadRequestException);
  });

  it('sums revenue to the cent without float drift', async () => {
    // FAILED BEFORE: the aggregate summed raw floats and returned
    // 30.700000000000003 for what should be 30.70.
    const prisma = makePrisma();
    let i = 0;
    for (const amount of [0.1, 0.2, 10.15, 20.25]) {
      prisma.__rows.push({
        id: `pay-${++i}`,
        companyId: COMPANY,
        amount,
        currency: 'ZAR',
        method: PaymentMethod.CARD,
        status: 'SUCCESS',
        reference: `PAY-${i}`,
        createdAt: new Date(),
      });
    }
    const stats = await build(prisma).getStats(COMPANY);
    expect(stats.totalRevenue).toBe(30.7);
    expect(Object.is(stats.totalRevenue, -0)).toBe(false);
  });

  it('reports zero revenue when nothing succeeded', async () => {
    const prisma = makePrisma();
    const stats = await build(prisma).getStats(COMPANY);
    expect(stats.totalRevenue).toBe(0);
    expect(stats.successRate).toBe(0);
  });
});

describe('DigitalPaymentsService — tenant context', () => {
  it('runs the create inside withTenant so RLS covers it', async () => {
    // FAILED BEFORE: create was a bare this.prisma.digitalPayment.create.
    const prisma = makePrisma();
    await build(prisma).createPayment(COMPANY, {
      amount: 50,
      method: PaymentMethod.CARD,
    });
    expect(prisma.withTenant).toHaveBeenCalledWith(COMPANY, expect.any(Function));
    expect(prisma.__tenants).toContain(COMPANY);
  });
});
