import { RevenueForecastService } from './revenue-forecast.service';

/**
 * The system clock drives period bucketing, so it is pinned. 'asOf' is the
 * last closed month; the forecast always targets the month after it.
 */
const NOW = new Date('2026-06-15T00:00:00Z');

interface Row {
  period: string;
  total: number;
  status?: string;
}

function monthEnd(period: string, day = 15): Date {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function makeHarness(
  invoiceRows: Row[],
  quoteRows: Array<{ price: number; accepted: boolean; expiresAt?: Date | null }> = [],
) {
  const forecasts: any[] = [];

  const tx = {
    invoice: {
      findMany: jest.fn(async ({ where }: any) => {
        const statuses: string[] | undefined = where?.status?.in;
        const from: Date | undefined = where?.createdAt?.gte;
        return invoiceRows
          .filter((r) => (statuses ? statuses.includes(r.status ?? 'SENT') : true))
          .filter((r) => (from ? monthEnd(r.period) >= from : true))
          .map((r) => ({ createdAt: monthEnd(r.period), total: r.total }));
      }),
    },
    quote: {
      findMany: jest.fn(async ({ where }: any) => {
        if (where?.accepted !== undefined && where.accepted !== true) return [];
        const or = where?.OR;
        return quoteRows
          .filter((q) => {
            if (!q.accepted) return false;
            if (!or) return true;
            return or.some((c: any) =>
              c.expiresAt === null
                ? q.expiresAt === null || q.expiresAt === undefined
                : q.expiresAt != null && q.expiresAt > c.expiresAt.gt,
            );
          })
          .map((q) => ({ price: q.price }));
      }),
    },
    revenueForecast: {
      upsert: jest.fn(async ({ where, create }: any) => {
        const key = where.companyId_forecastPeriod_forecastType;
        const i = forecasts.findIndex(
          (f) =>
            f.companyId === key.companyId &&
            f.forecastPeriod === key.forecastPeriod &&
            f.forecastType === key.forecastType,
        );
        if (i === -1) {
          forecasts.push({ id: `fc-${forecasts.length + 1}`, ...create });
        } else {
          forecasts[i] = { ...forecasts[i], ...create };
        }
        return forecasts[i === -1 ? forecasts.length - 1 : i];
      }),
      findMany: jest.fn(async ({ where, take }: any = {}) => {
        let rows = forecasts.filter((f) => !where?.companyId || f.companyId === where.companyId);
        if (where?.forecastPeriod?.lt) rows = rows.filter((f) => f.forecastPeriod < where.forecastPeriod.lt);
        if (where?.actualRevenue === null) rows = rows.filter((f) => f.actualRevenue === null || f.actualRevenue === undefined);
        rows = [...rows].sort((a, b) => (a.forecastPeriod < b.forecastPeriod ? 1 : -1));
        return typeof take === 'number' ? rows.slice(0, take) : rows;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const f = forecasts.find((x) => x.id === where.id);
        if (f) Object.assign(f, data);
        return f;
      }),
    },
  };

  const prisma = {
    withTenant: jest.fn(async (companyId: string, fn: (client: any) => Promise<any>) => {
      if (typeof companyId !== 'string' || companyId.trim() === '') throw new Error('empty tenant');
      return fn(tx);
    }),
  };

  return { service: new RevenueForecastService(prisma as any), tx, forecasts };
}

/** N consecutive months ending at `end`, with the given revenue each. */
function series(end: string, values: number[]): Row[] {
  const [ey, em] = end.split('-').map(Number);
  return values.map((v, i) => {
    const total = ey * 12 + (em - 1) - (values.length - 1 - i);
    const period = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
    return { period, total: v };
  });
}

describe('RevenueForecastService', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => jest.useRealTimers());

  describe('refusing when there is nothing to forecast from', () => {
    it('produces no forecast with fewer than 3 revenue-bearing months', async () => {
      const { service } = makeHarness(series('2026-05', [100, 200]));
      const result = await service.generate('company-1', '2026-05');

      expect(result.generated).toBe(false);
      expect(result.periodsAvailable).toBe(2);
      expect(result.periodsRequired).toBe(3);
      expect(result.reason).toMatch(/fewer than 3/);
    });

    it('produces no forecast when nothing has ever been recognised', async () => {
      const { service } = makeHarness([{ period: '2026-05', total: 500, status: 'DRAFT' }]);
      const result = await service.generate('company-1', '2026-05');

      expect(result.generated).toBe(false);
      expect(result.reason).toMatch(/No month in the lookback window/);
    });

    it('issues a forecast at exactly 3 revenue-bearing months', async () => {
      const { service } = makeHarness(series('2026-05', [100, 200, 300]));
      const result = await service.generate('company-1', '2026-05');
      expect(result.generated).toBe(true);
    });
  });

  describe('what counts as revenue', () => {
    it('excludes DRAFT and CANCELLED invoices', async () => {
      const rows = [
        ...series('2026-05', [1000, 1000, 1000]).map((r) => ({ ...r, status: 'SENT' })),
        { period: '2026-05', total: 999999, status: 'DRAFT' },
        { period: '2026-04', total: 999999, status: 'CANCELLED' },
      ];
      const { service } = makeHarness(rows);
      const result = await service.generate('company-1', '2026-05');

      // A nine-hundred-thousand-rand draft would have swamped the prediction.
      expect(result.predictedRevenue).toBeLessThan(5000);
    });

    it('counts SENT, PAID and OVERDUE', async () => {
      const rows: Row[] = ['2026-03', '2026-04', '2026-05'].flatMap((period) => [
        { period, total: 100, status: 'SENT' },
        { period, total: 100, status: 'PAID' },
        { period, total: 100, status: 'OVERDUE' },
      ]);
      const { service } = makeHarness(rows);
      const result = await service.generate('company-1', '2026-05');

      expect(result.historicalAvg).toBe(300);
      expect(result.predictedRevenue).toBeCloseTo(300, 1);
    });
  });

  describe('the fit', () => {
    it('recovers an exact linear trend and reports a zero-width interval', async () => {
      // 100,200,300,400,500,600 -> slope 100, intercept 100, next is 700.
      const { service } = makeHarness(series('2026-05', [100, 200, 300, 400, 500, 600]));
      const result = await service.generate('company-1', '2026-05');

      expect(result.method).toBe('OLS_TREND');
      expect(result.trend).toBeCloseTo(100, 1);
      expect(result.predictedRevenue).toBeCloseTo(700, 0);
      // A perfect fit earns a perfect score; the interval is narrow because
      // the residuals are, not because anyone asserted confidence.
      expect(result.confidence).toBe(100);
    });

    it('fits no trend below 6 periods, and says so', async () => {
      const { service } = makeHarness(series('2026-05', [100, 200, 300]));
      const result = await service.generate('company-1', '2026-05');

      expect(result.method).toBe('TRAILING_MEAN');
      expect(result.trend).toBeNull();
      expect(result.basis).toMatch(/Too few periods to fit a trend/);
      expect(result.predictedRevenue).toBeCloseTo(200, 0);
    });

    it('widens the interval when the same spread is seen over less history', async () => {
      const noisy6 = [100, 200, 100, 200, 100, 200];
      const noisy12 = [...noisy6, ...noisy6];

      const short = await makeHarness(series('2026-05', noisy6)).service.generate('company-1', '2026-05');
      const long = await makeHarness(series('2026-05', noisy12)).service.generate('company-1', '2026-05');

      const width = (r: any) => r.upperBound - r.lowerBound;
      // Same underlying volatility, twice the evidence -> tighter interval.
      expect(width(long)).toBeLessThan(width(short));
    });

    it('scores a noisy series low and a clean one high, without being told which is which', async () => {
      const noisy = await makeHarness(series('2026-05', [100, 200, 100, 200, 100, 200])).service.generate(
        'company-1',
        '2026-05',
      );
      const clean = await makeHarness(series('2026-05', [100, 200, 300, 400, 500, 600])).service.generate(
        'company-1',
        '2026-05',
      );

      expect(clean.confidence).toBeGreaterThan(noisy.confidence);
      expect(noisy.confidence).toBeLessThan(60);
    });

    it('clamps the lower bound at zero and reports that it did', async () => {
      const { service } = makeHarness(series('2026-05', [100, 400, 100, 400, 100, 400]));
      const result = await service.generate('company-1', '2026-05');

      expect(result.lowerBound).toBeGreaterThanOrEqual(0);
      expect(result.lowerBoundClampedAtZero).toBe(result.lowerBound === 0);
    });

    it('ignores months before the company first billed', async () => {
      // Three real months, but the 24-month window starts 21 months earlier.
      const { service } = makeHarness(series('2026-05', [1000, 1000, 1000]));
      const result = await service.generate('company-1', '2026-05');

      // Without trimming, 21 leading zeros would drag the level near 130.
      expect(result.historicalAvg).toBe(1000);
      expect(result.periodsTrimmedBeforeFirstRevenue).toBeGreaterThan(0);
    });
  });

  describe('pipeline is never folded into the prediction', () => {
    it('stores accepted quotes separately and leaves the prediction untouched', async () => {
      const { service } = makeHarness(series('2026-05', [100, 200, 300]), [
        { price: 50000, accepted: true },
      ]);
      const result = await service.generate('company-1', '2026-05');

      expect(result.pipeline.value).toBe(50000);
      expect(result.pipelineValue).toBe(50000);
      // The known 50k must not appear in the predicted figure.
      expect(result.predictedRevenue).toBeCloseTo(200, 0);
    });

    it('excludes quotes that were never accepted', async () => {
      const { service } = makeHarness(series('2026-05', [100, 200, 300]), [
        { price: 99999, accepted: false },
      ]);
      const result = await service.generate('company-1', '2026-05');
      expect(result.pipeline.value).toBe(0);
    });

    it('excludes accepted quotes that have expired', async () => {
      const { service } = makeHarness(series('2026-05', [100, 200, 300]), [
        { price: 99999, accepted: true, expiresAt: new Date('2026-01-01T00:00:00Z') },
      ]);
      const result = await service.generate('company-1', '2026-05');
      expect(result.pipeline.value).toBe(0);
    });

    it('includes accepted quotes that expire in the future', async () => {
      const { service } = makeHarness(series('2026-05', [100, 200, 300]), [
        { price: 7000, accepted: true, expiresAt: new Date('2026-12-01T00:00:00Z') },
      ]);
      const result = await service.generate('company-1', '2026-05');
      expect(result.pipeline.value).toBe(7000);
    });
  });

  describe('seasonality', () => {
    it('is not estimated from a single cycle', async () => {
      const { service } = makeHarness(series('2026-05', Array.from({ length: 14 }, (_, i) => 100 + i * 10)));
      const result = await service.generate('company-1', '2026-05');
      expect(result.seasonalFactor).toBeNull();
    });

    it('is estimated once two full cycles exist', async () => {
      const { service } = makeHarness(series('2026-05', Array.from({ length: 24 }, (_, i) => 100 + (i % 12) * 10)));
      const result = await service.generate('company-1', '2026-05');
      expect(result.seasonalFactor).not.toBeNull();
      expect(result.seasonalFactor).toBeGreaterThan(0);
    });
  });

  describe('persistence', () => {
    it('is idempotent for the same period', async () => {
      const { service, forecasts } = makeHarness(series('2026-05', [100, 200, 300]));
      await service.generate('company-1', '2026-05');
      await service.generate('company-1', '2026-05');

      expect(forecasts).toHaveLength(1);
    });

    it('targets the month after the as-of period', async () => {
      const { service, forecasts } = makeHarness(series('2026-05', [100, 200, 300]));
      const result = await service.generate('company-1', '2026-05');

      expect(result.forecastPeriod).toBe('2026-06');
      expect(forecasts[0].forecastPeriod).toBe('2026-06');
    });
  });

  describe('scoring against what actually happened', () => {
    it('fills actual revenue and accuracy once the period has closed', async () => {
      // Periods: 2025-12=100, 2026-01=200, 2026-02=300, 2026-03=400, ...
      const { service, tx } = makeHarness(series('2026-05', [100, 200, 300, 400, 500, 600]));
      // Forecast 2026-03 (the month after the as-of period) from 100/200/300.
      await service.generate('company-1', '2026-02');
      const scored = await service.score('company-1');

      expect(scored.updated).toBe(1);
      const calls = tx.revenueForecast.update.mock.calls as any[][];
      expect(calls.length).toBeGreaterThan(0);
      const row = calls[0][0].data;
      // 2026-03 actually billed 400, against a trailing-mean prediction of 200.
      expect(row.actualRevenue).toBe(400);
      expect(row.accuracy).toBeCloseTo(50, 1);
    });

    it('reports whether the outcome landed inside the interval', async () => {
      const { service } = makeHarness(series('2026-05', [100, 200, 300, 400, 500, 600]));
      await service.generate('company-1', '2026-02');
      await service.score('company-1');

      const rows = await service.list('company-1');
      expect(rows[0].withinInterval).toBe(true);
    });

    it('skips periods that have not closed yet', async () => {
      const { service } = makeHarness(series('2026-05', [100, 200, 300]));
      await service.generate('company-1', '2026-05'); // targets 2026-06, still open
      const scored = await service.score('company-1');
      expect(scored.updated).toBe(0);
    });
  });

  describe('tenant scope', () => {
    it('refuses to run without a company id', async () => {
      const { service } = makeHarness([]);
      await expect(service.generate('', '2026-05')).rejects.toThrow(/empty tenant/);
    });

    it('scopes every forecast read to the calling company', async () => {
      const { service, tx } = makeHarness(series('2026-05', [100, 200, 300]));
      await service.list('company-1');
      expect(tx.revenueForecast.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: 'company-1' } }),
      );
    });
  });

  describe('observed series', () => {
    it('keeps months that billed nothing', async () => {
      const rows: Row[] = [
        { period: '2026-03', total: 100 },
        { period: '2026-05', total: 300 },
      ];
      const { service } = makeHarness(rows);
      const observed = await service.observed('company-1', '2026-05');

      const april = observed.find((o) => o.period === '2026-04');
      expect(april).toEqual({ period: '2026-04', revenue: 0, invoices: 0 });
    });
  });
});
