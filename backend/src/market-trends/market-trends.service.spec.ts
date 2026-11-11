import { MarketTrendsService } from './market-trends.service';

/**
 * MARKET TRENDS — a paid feature whose data comes from an AI call.
 *
 * `getMarketTrends` is declared to return `MarketTrendData`, but the AI branch
 * does `return { ...content, generatedAt, model }` — spreading whatever the model
 * sent, validated by nothing. The type is a claim the code does not keep.
 *
 * That matters because this is a paid feature: a customer is looking at a screen
 * with numbers on it. If the model returns `segments` as an object instead of an
 * array, or `share` as the string "about forty", the UI renders nonsense or
 * throws — and the failure looks like the product is broken, not like the model
 * had an off day.
 *
 * The rule: AI output is input. Validate it at the boundary or fall back to the
 * static dataset, which exists precisely for this.
 */

const COMPANY = 'co-1';

const VALID = {
  overview: {
    marketSize: 'R 12 billion',
    growthRate: '6.5% CAGR',
    projectedGrowth: 'R 18 billion by 2030',
    keyDrivers: ['e-commerce', 'fuel costs'],
  },
  segments: [{ name: 'Last-mile', share: 45, growth: '12%', outlook: 'Strong' }],
  competitors: [
    { name: 'Aramex', strength: 'Scale', recentMove: 'New hub', threat: 'HIGH' as const },
  ],
  opportunities: [
    { title: 'Night delivery', description: 'Off-peak', impact: 'HIGH' as const, timeframe: '6m' },
  ],
  predictions: [
    { title: 'Consolidation', confidence: 80, description: 'M&A', timeHorizon: '2026-2027' },
  ],
};

function makeService() {
  const prisma: any = {
    company: {
      findUnique: jest.fn(async () => ({
        id: COMPANY,
        name: 'Test Co',
        country: 'South Africa',
      })),
    },
    waybill: { count: jest.fn(async () => 10) },
    driver: { count: jest.fn(async () => 2) },
  };
  const config: any = { get: jest.fn(() => 'test-key') };
  return { svc: new MarketTrendsService(prisma, config), prisma };
}

/** Replace global fetch with a scripted Groq response. */
function stubGroq(content: unknown) {
  const spy = jest
    .spyOn(global, 'fetch' as any)
    .mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }),
    } as any);
  return spy;
}

afterEach(() => jest.restoreAllMocks());

describe('MarketTrendsService — AI output is validated at the boundary', () => {
  it('returns the model’s data when it matches the contract', async () => {
    stubGroq(VALID);
    const { svc } = makeService();

    const out: any = await svc.getMarketTrends(COMPANY);
    expect(out.segments[0].name).toBe('Last-mile');
    expect(out.model).toBeDefined();
  });

  it('falls back to static data when segments is not an array', async () => {
    // FAILED BEFORE: the spread copied the malformed payload straight through,
    // and the UI tried to iterate an object.
    stubGroq({ ...VALID, segments: { name: 'oops' } });
    const { svc } = makeService();

    const out: any = await svc.getMarketTrends(COMPANY);
    expect(Array.isArray(out.segments)).toBe(true);
  });

  it('falls back when a segment share is not a number', async () => {
    // "about forty" renders as a broken bar chart.
    stubGroq({ ...VALID, segments: [{ name: 'A', share: 'about forty', growth: '1%', outlook: 'x' }] });
    const { svc } = makeService();

    const out: any = await svc.getMarketTrends(COMPANY);
    for (const s of out.segments) {
      expect(typeof s.share).toBe('number');
    }
  });

  it('falls back when the overview is missing', async () => {
    stubGroq({ segments: VALID.segments });
    const { svc } = makeService();

    const out: any = await svc.getMarketTrends(COMPANY);
    expect(out.overview).toBeTruthy();
    expect(Array.isArray(out.overview.keyDrivers)).toBe(true);
  });

  it('falls back to static data when the model returns malformed JSON', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'not json at all' } }] }),
    } as any);
    const { svc } = makeService();

    const out: any = await svc.getMarketTrends(COMPANY);
    expect(out.segments.length).toBeGreaterThan(0);
  });

  it('falls back when the AI call itself fails', async () => {
    jest
      .spyOn(global, 'fetch' as any)
      .mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as any);
    const { svc } = makeService();

    const out: any = await svc.getMarketTrends(COMPANY);
    expect(out.segments.length).toBeGreaterThan(0);
  });

  it('never lets the model inject arbitrary top-level fields', async () => {
    // The spread also copied anything else the model invented. Keeping the
    // surface to the declared contract means a stray field cannot shadow a real
    // one (for example a model-supplied `generatedAt`).
    stubGroq({ ...VALID, __proto__: null, generatedAt: '1999-01-01', surprise: 'x' } as any);
    const { svc } = makeService();

    const out: any = await svc.getMarketTrends(COMPANY);
    expect(out.surprise).toBeUndefined();
    expect(out.generatedAt).not.toBe('1999-01-01');
  });
});

describe('MarketTrendsService — tenant safety', () => {
  it('only reads the requested company', async () => {
    stubGroq(VALID);
    const { svc, prisma } = makeService();
    await svc.getMarketTrends(COMPANY);
    expect(prisma.company.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: COMPANY } }),
    );
  });
});
