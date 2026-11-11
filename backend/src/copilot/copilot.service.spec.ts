import { CopilotService } from './copilot.service';

/**
 * COPILOT — natural-language analytics over live tenant data.
 *
 * Tenant scoping is correct: every query the trend builder issues carries
 * companyId, and the parsed intent only ever selects an aggregate.
 *
 * The defect was in WHICH window those aggregates covered. The bucket loop
 * walked forward from the start of the requested range under a 31-iteration
 * cap, so a question about a period longer than a month was answered from the
 * OLDEST slice of it — while the sentence claimed the whole period.
 */

const COMPANY = 'co-1';
const VICTIM = 'co-2';
const DAY = 86_400_000;

function makeHarness() {
  const waybills: any[] = [];
  const invoices: any[] = [];

  const prisma: any = {
    waybill: {
      count: jest.fn(async ({ where }: any = {}) =>
        waybills.filter(
          (w) =>
            w.companyId === where.companyId &&
            (!where.createdAt?.gte || w.createdAt >= where.createdAt.gte) &&
            (!where.createdAt?.lte || w.createdAt <= where.createdAt.lte),
        ).length,
      ),
    },
    invoice: {
      aggregate: jest.fn(async ({ where, _sum }: any = {}) => {
        // Support both `status: 'PAID'` and `status: { in: [...] }`, and always
        // return _count: the revenue path reads agg._count._all, and a fake
        // that omits it throws — which ask()'s try/catch converts into a
        // friendly null answer rather than a failure you can see.
        const wanted: string[] | null = where.status
          ? typeof where.status === 'string' ? [where.status] : where.status.in
          : null;
        const rows = invoices.filter(
          (i) =>
            i.companyId === where.companyId &&
            (!wanted || wanted.includes(i.status)) &&
            (!where.createdAt?.gte || i.createdAt >= where.createdAt.gte) &&
            (!where.createdAt?.lte || i.createdAt <= where.createdAt.lte),
        );
        return {
          _sum: { total: rows.reduce((s, i) => s + i.total, 0) },
          _count: { _all: rows.length },
        };
      }),
    },
    __waybills: waybills,
    __invoices: invoices,
  };

  return { prisma, svc: new CopilotService(prisma as any) };
}

/** Seed `n` waybills on the day `daysAgo` days before today. */
const seedOn = (h: any, daysAgo: number, n: number, companyId = COMPANY) => {
  const at = new Date(Date.now() - daysAgo * DAY);
  for (let i = 0; i < n; i++) h.prisma.__waybills.push({ companyId, createdAt: at });
};

const ask = (h: any, q: string) => h.svc.ask(COMPANY, q);

describe('CopilotService — a window wider than the chart must return the RECENT days', () => {
  it('answers "last 90 days" from the last 31 days, not the oldest 31', async () => {
    // FAILED BEFORE: `days` was capped at 31 but the loop still walked FORWARD
    // from gte, so a 90-day question was answered from days 90..60 ago while
    // the sentence said "in the last 90 days".
    //
    // Seeding is deliberately NON-UNIFORM: a flat series would produce the same
    // total under both windows and the bug would pass.
    const h = makeHarness();
    for (let d = 0; d < 5; d++) seedOn(h, d, 10); //  50 waybills, very recent
    seedOn(h, 89, 5); //                              5 waybills, oldest end

    const out: any = await ask(h, 'waybills per day in the last 90 days');

    expect(out.value).toEqual(50); // the recent cluster
    expect(out.value).not.toEqual(5); // the oldest cluster the bug returned
  });

  it('does not claim a 90-day window it did not measure', async () => {
    // The answer text must describe the data actually summed.
    const h = makeHarness();
    seedOn(h, 1, 3);

    const out: any = await ask(h, 'waybills per day in the last 90 days');

    expect(out.answer).toMatch(/last 31 days/i);
    expect(out.answer).not.toMatch(/last 90 days/i);
  });

  it('answers "this year" from the recent past, not from January', async () => {
    // The starkest case: gte = 1 January, so a 31-bucket forward walk summed
    // January and called it "this year".
    const h = makeHarness();
    seedOn(h, 1, 7); // recent
    const jan15 = new Date(new Date().getFullYear(), 0, 15, 12);
    for (let i = 0; i < 3; i++) {
      h.prisma.__waybills.push({ companyId: COMPANY, createdAt: jan15 });
    }

    const out: any = await ask(h, 'waybills per day this year');

    expect(out.value).toEqual(7);
  });

  it('keeps an in-range window intact', async () => {
    const h = makeHarness();
    for (let d = 0; d < 7; d++) seedOn(h, d, 2); // 14 waybills in 7 days

    const out: any = await ask(h, 'waybills per day in the last 7 days');

    expect(out.value).toEqual(14);
    expect(out.answer).toMatch(/last 7 days/i); // unclamped, so the label stands
    // 8 buckets, not 7: the parser returns calendar days from startOfDay(gte)
    // to endOfDay(lte), so "last 7 days" covers 8 calendar days inclusive of
    // today. Pre-existing semantics shared by every intent — pinned, not
    // changed, so a future refactor cannot move it silently.
    expect(out.chart.values).toHaveLength(8);
    expect(out.chart.values.reduce((s: number, v: number) => s + v, 0)).toEqual(14);
  });

  it('emits one chart bucket per day in the window', async () => {
    const h = makeHarness();
    seedOn(h, 0, 1);

    const out: any = await ask(h, 'waybills per day today');

    expect(out.chart.type).toEqual('line');
    expect(out.chart.values).toHaveLength(1);
  });
});

describe('CopilotService — tenant scoping', () => {
  it('never counts another tenant’s waybills into the answer', async () => {
    const h = makeHarness();
    seedOn(h, 1, 4, COMPANY);
    seedOn(h, 1, 400, VICTIM);

    const out: any = await ask(h, 'waybills per day in the last 7 days');

    expect(out.value).toEqual(4);
  });

  it('scopes revenue to the calling tenant', async () => {
    // "revenue" is dispatched to revenue() ahead of the trend branch, so this
    // exercises the money path a user actually reaches.
    const h = makeHarness();
    h.prisma.__invoices.push({ companyId: COMPANY, status: 'PAID', total: 100, createdAt: new Date() });
    h.prisma.__invoices.push({ companyId: VICTIM, status: 'PAID', total: 99_999, createdAt: new Date() });

    const out: any = await ask(h, 'revenue this week');

    expect(out.value).toEqual(100);
  });

  it('reports no matches for an empty question rather than throwing', async () => {
    const h = makeHarness();
    const out: any = await ask(h, '   ');
    expect(out.matched).toBe(false);
  });
});
