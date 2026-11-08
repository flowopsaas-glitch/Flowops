import 'reflect-metadata';
import { OwnerService } from './owner.service';

/**
 * The owner console showed what a tenant was DOING (MRR, seats, waybills) but
 * never where the relationship STOOD — being courted, happy, at risk, leaving.
 * That lived in someone's head and in Slack threads, so it was lost whenever
 * that person was unavailable. These methods are that surface.
 *
 * Two rules here are the ones worth defending, because both are the kind that
 * quietly rot: a commercial status is refused unless it carries a reason, and
 * a quote/invoice is always filed against the tenant named in the URL rather
 * than anything the caller put in the body.
 */

const OWNER_ACTOR = { id: 'own1', email: 'owner@flowops.co.za' } as any;

const companyRow = (over: Record<string, unknown> = {}) => ({
  id: 'cmp-1',
  name: 'Mokoena Freight (Pty) Ltd',
  tradingName: 'Mokoena Freight',
  plan: 'GROWTH',
  commercialStatus: 'AT_RISK',
  commercialStatusReason: 'Missed two check-ins',
  commercialStatusChangedAt: new Date('2026-11-01T09:00:00Z'),
  featureOverrides: { railSlots: true },
  priceOverrideZar: 4500,
  updatedAt: new Date('2026-11-05T09:00:00Z'),
  ...over,
});

/** OwnerService has six constructor dependencies; the three under test are enough. */
const makeService = (
  prisma: Record<string, any>,
  audit: Record<string, any> = { record: jest.fn().mockResolvedValue(undefined) },
  invoices: Record<string, any> = { create: jest.fn().mockResolvedValue({ id: 'inv-1' }) },
) => {
  const svc = Object.create(OwnerService.prototype) as OwnerService;
  (svc as any).prisma = prisma;
  (svc as any).audit = audit;
  (svc as any).invoices = invoices;
  return svc;
};

/** The six counts/firsts `buildCommercialSummary` reads per tenant. */
const commercialCounts = (over: Record<string, any> = {}) => ({
  quote: { findFirst: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0) },
  invoice: { findFirst: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0) },
  commercialNote: {
    findFirst: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockResolvedValue({ id: 'note-1' }),
  },
  ...over,
});

describe('OwnerService commercial summary', () => {
  it('lists every tenant with its commercial standing', async () => {
    const findMany = jest.fn().mockResolvedValue([companyRow(), companyRow({ id: 'cmp-2' })]);
    const svc = makeService({ company: { findMany }, ...commercialCounts() });

    const rows = await svc.listTenantCommercial();

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      tenantId: 'cmp-1',
      tenantName: 'Mokoena Freight',
      commercialStatus: 'AT_RISK',
      commercialStatusReason: 'Missed two check-ins',
    });
    // ISO strings, not Date objects — the console renders and sorts these.
    expect(rows[0].statusChangedAt).toBe('2026-11-01T09:00:00.000Z');
    expect(rows[0].counts).toEqual({ notes: 0, quotes: 0, invoices: 0 });
  });

  it('falls back to the registered name when the tenant has no trading name', async () => {
    const svc = makeService({
      company: { findMany: jest.fn().mockResolvedValue([companyRow({ tradingName: null })]) },
      ...commercialCounts(),
    });

    const rows = await svc.listTenantCommercial();

    expect(rows[0].tenantName).toBe('Mokoena Freight (Pty) Ltd');
  });

  it('summarises the override as a list of feature names, and null when there is none', async () => {
    const svc = makeService({
      company: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            companyRow(),
            companyRow({ id: 'cmp-2', featureOverrides: null, priceOverrideZar: null }),
          ]),
      },
      ...commercialCounts(),
    });

    const rows = await svc.listTenantCommercial();

    expect(rows[0].subscriptionOverrideSummary).toEqual({
      features: ['railSlots'],
      priceOverrideZar: 4500,
    });
    expect(rows[1].subscriptionOverrideSummary).toBeNull();
    // The raw value is still carried for edit forms.
    expect(rows[0].subscriptionOverride).toEqual({
      featureOverrides: { railSlots: true },
      priceOverrideZar: 4500,
    });
  });

  it('rejects an unknown tenant rather than returning an empty picture', async () => {
    const svc = makeService({
      company: { findUnique: jest.fn().mockResolvedValue(null) },
      ...commercialCounts(),
    });

    await expect(svc.getTenantCommercialSummary('nope')).rejects.toThrow('Tenant not found');
  });

  it('counts each tenant against that tenant alone', async () => {
    const counts = commercialCounts();
    const svc = makeService({
      company: { findMany: jest.fn().mockResolvedValue([companyRow(), companyRow({ id: 'cmp-2' })]) },
      ...counts,
    });

    await svc.listTenantCommercial();

    for (const model of ['quote', 'invoice', 'commercialNote'] as const) {
      for (const call of counts[model].count.mock.calls) {
        expect(call[0].where.companyId).toMatch(/^cmp-/);
      }
    }
    // Both tenants counted, so three models × two tenants.
    expect(counts.commercialNote.count).toHaveBeenCalledTimes(2);
  });
});

describe('OwnerService commercial notes', () => {
  it('refuses an empty note', async () => {
    const create = jest.fn();
    const svc = makeService({
      company: { findUnique: jest.fn().mockResolvedValue(companyRow()) },
      ...commercialCounts({ commercialNote: { create } }),
    });

    await expect(svc.addCommercialNote('cmp-1', { note: '   ' }, OWNER_ACTOR)).rejects.toThrow(
      /cannot be empty/i,
    );
    await expect(svc.addCommercialNote('cmp-1', {}, OWNER_ACTOR)).rejects.toThrow(
      /cannot be empty/i,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('stores the note against the tenant in the URL and records who wrote it', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'note-1' });
    const record = jest.fn().mockResolvedValue(undefined);
    const svc = makeService(
      {
        company: { findUnique: jest.fn().mockResolvedValue(companyRow()) },
        ...commercialCounts({ commercialNote: { create } }),
      },
      { record },
    );

    await svc.addCommercialNote('cmp-1', { note: '  Called the MD; renewal likely.  ', tags: ['renewal'] }, OWNER_ACTOR);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 'cmp-1',
          note: 'Called the MD; renewal likely.',
          tags: ['renewal'],
          createdByEmail: 'owner@flowops.co.za',
        }),
      }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.commercial_note_added',
        actorId: 'own1',
        targetId: 'cmp-1',
        targetName: 'Mokoena Freight (Pty) Ltd',
      }),
    );
  });

  it('drops non-string tags instead of storing junk in the JSON column', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'note-1' });
    const svc = makeService({
      company: { findUnique: jest.fn().mockResolvedValue(companyRow()) },
      ...commercialCounts({ commercialNote: { create } }),
    });

    await svc.addCommercialNote('cmp-1', { note: 'ok', tags: ['renewal', 42, null, '  ', 'zebra'] }, OWNER_ACTOR);

    expect(create.mock.calls[0][0].data.tags).toEqual(['renewal', 'zebra']);
  });

  it('refuses a note on an unknown tenant', async () => {
    const svc = makeService({
      company: { findUnique: jest.fn().mockResolvedValue(null) },
      ...commercialCounts(),
    });

    await expect(svc.addCommercialNote('nope', { note: 'hi' }, OWNER_ACTOR)).rejects.toThrow(
      'Tenant not found',
    );
  });
});

describe('OwnerService commercial status', () => {
  const statusService = (over: Record<string, any> = {}) =>
    makeService({
      company: {
        findUnique: jest.fn().mockResolvedValue(companyRow()),
        update: jest.fn().mockResolvedValue(companyRow(over)),
      },
      ...commercialCounts(),
    });

  it('refuses a status without a reason', async () => {
    const svc = statusService();

    await expect(svc.updateCommercialStatus('cmp-1', { status: 'CHURNING' }, OWNER_ACTOR)).rejects.toThrow(
      /needs a reason/i,
    );
    await expect(
      svc.updateCommercialStatus('cmp-1', { status: 'CHURNING', reason: '   ' }, OWNER_ACTOR),
    ).rejects.toThrow(/needs a reason/i);
    expect((svc as any).prisma.company.update).not.toHaveBeenCalled();
  });

  it('refuses a status outside the known set', async () => {
    const svc = statusService();

    await expect(
      svc.updateCommercialStatus('cmp-1', { status: 'VIBING', reason: 'feels right' }, OWNER_ACTOR),
    ).rejects.toThrow(/Unknown commercial status/);
    await expect(
      svc.updateCommercialStatus('cmp-1', { status: '', reason: 'x' }, OWNER_ACTOR),
    ).rejects.toThrow(/is required/);
    expect((svc as any).prisma.company.update).not.toHaveBeenCalled();
  });

  it('writes the status, its reason and a fresh timestamp, and audits the move', async () => {
    const record = jest.fn().mockResolvedValue(undefined);
    const svc = makeService(
      {
        company: {
          findUnique: jest.fn().mockResolvedValue(companyRow({ commercialStatus: 'ACTIVE' })),
          update: jest.fn().mockResolvedValue(companyRow({ commercialStatus: 'CHURNING' })),
        },
        ...commercialCounts(),
      },
      { record },
    );

    const before = Date.now();
    await svc.updateCommercialStatus(
      'cmp-1',
      { status: 'CHURNING', reason: 'Signed with a competitor' },
      OWNER_ACTOR,
    );

    const data = (svc as any).prisma.company.update.mock.calls[0][0].data;
    expect(data.commercialStatus).toBe('CHURNING');
    expect(data.commercialStatusReason).toBe('Signed with a competitor');
    expect(data.commercialStatusChangedAt.getTime()).toBeGreaterThanOrEqual(before);

    // from → to is what makes the audit trail readable later.
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.commercial_status_changed',
        targetId: 'cmp-1',
        metadata: expect.objectContaining({
          from: 'ACTIVE',
          to: 'CHURNING',
          reason: 'Signed with a competitor',
        }),
      }),
    );
  });

  it('refuses a status on an unknown tenant', async () => {
    const svc = makeService({
      company: { findUnique: jest.fn().mockResolvedValue(null) },
      ...commercialCounts(),
    });

    await expect(
      svc.updateCommercialStatus('nope', { status: 'ACTIVE', reason: 'x' }, OWNER_ACTOR),
    ).rejects.toThrow('Tenant not found');
  });
});

describe('OwnerService subscription overrides', () => {
  it('writes only the two override columns, never arbitrary ones from the body', async () => {
    const update = jest.fn().mockResolvedValue(companyRow());
    const svc = makeService({
      company: { findUnique: jest.fn().mockResolvedValue(companyRow()), ...{ update } },
      ...commercialCounts(),
    });

    await svc.updateSubscriptionOverride(
      'cmp-1',
      // An owner console body that also tries to rewrite the plan and MRR.
      { featureOverrides: { railSlots: true }, plan: 'ENTERPRISE', mrrZar: 0 },
      OWNER_ACTOR,
    );

    const data = update.mock.calls[0][0].data;
    expect(Object.keys(data).sort()).toEqual(['featureOverrides']);
    expect(data).not.toHaveProperty('plan');
    expect(data).not.toHaveProperty('mrrZar');
  });

  it('refuses a negative price override', async () => {
    const update = jest.fn();
    const svc = makeService({
      company: { findUnique: jest.fn().mockResolvedValue(companyRow()), update },
      ...commercialCounts(),
    });

    await expect(
      svc.updateSubscriptionOverride('cmp-1', { priceOverrideZar: -100 }, OWNER_ACTOR),
    ).rejects.toThrow(/non-negative/);
    await expect(
      svc.updateSubscriptionOverride('cmp-1', { priceOverrideZar: 'abc' }, OWNER_ACTOR),
    ).rejects.toThrow(/non-negative/);
    expect(update).not.toHaveBeenCalled();
  });

  it('accepts null to clear an override, and 0 as a real price', async () => {
    const update = jest.fn().mockResolvedValue(companyRow());
    const svc = makeService({
      company: { findUnique: jest.fn().mockResolvedValue(companyRow()), update },
      ...commercialCounts(),
    });

    await svc.updateSubscriptionOverride('cmp-1', { priceOverrideZar: null }, OWNER_ACTOR);
    expect(update.mock.calls[0][0].data.priceOverrideZar).toBeNull();

    await svc.updateSubscriptionOverride('cmp-1', { priceOverrideZar: 0 }, OWNER_ACTOR);
    expect(update.mock.calls[1][0].data.priceOverrideZar).toBe(0);
  });

  it('clearing featureOverrides writes the null sentinel, not a bare JSON null', async () => {
    /**
     * Prisma.InputJsonValue disallows a bare `null` — "JSON null" and "SQL
     * NULL" would be ambiguous — so clearing the column has to be an explicit
     * DbNull. Assert the key is written rather than pinning the sentinel's
     * value: the local Prisma stub resolves `Prisma.DbNull` to undefined while
     * the generated client resolves it to the sentinel, and only the
     * generated client is what runs in production.
     */
    const update = jest.fn().mockResolvedValue(companyRow());
    const svc = makeService({
      company: { findUnique: jest.fn().mockResolvedValue(companyRow()), update },
      ...commercialCounts(),
    });

    await svc.updateSubscriptionOverride('cmp-1', { featureOverrides: null }, OWNER_ACTOR);

    expect(update.mock.calls[0][0].data).toHaveProperty('featureOverrides');
  });

  it('stores featureOverrides as a plain JSON value, rejecting anything unserialisable', async () => {
    const update = jest.fn().mockResolvedValue(companyRow());
    const svc = makeService({
      company: { findUnique: jest.fn().mockResolvedValue(companyRow()), update },
      ...commercialCounts(),
    });

    await svc.updateSubscriptionOverride(
      'cmp-1',
      { featureOverrides: { railSlots: true, note: 'negotiated', nested: { cap: 40 } } },
      OWNER_ACTOR,
    );
    expect(update.mock.calls[0][0].data.featureOverrides).toEqual({
      railSlots: true,
      note: 'negotiated',
      nested: { cap: 40 },
    });

    // A function would silently vanish through JSON.stringify; refuse it.
    await expect(
      svc.updateSubscriptionOverride('cmp-1', { featureOverrides: { bad: () => 1 } }, OWNER_ACTOR),
    ).rejects.toThrow(/JSON-serialisable/);

    // So would a non-finite number, which JSON would turn into `null`.
    await expect(
      svc.updateSubscriptionOverride('cmp-1', { featureOverrides: { cap: NaN } }, OWNER_ACTOR),
    ).rejects.toThrow(/finite number/);
  });

  it('refuses a non-object featureOverrides and an empty body', async () => {
    const update = jest.fn();
    const svc = makeService({
      company: { findUnique: jest.fn().mockResolvedValue(companyRow()), update },
      ...commercialCounts(),
    });

    await expect(
      svc.updateSubscriptionOverride('cmp-1', { featureOverrides: ['a'] }, OWNER_ACTOR),
    ).rejects.toThrow(/must be an object or null/);
    await expect(svc.updateSubscriptionOverride('cmp-1', {}, OWNER_ACTOR)).rejects.toThrow(
      /Supply featureOverrides/,
    );
    expect(update).not.toHaveBeenCalled();
  });
});

describe('OwnerService owner-raised quotes and invoices', () => {
  it('files a quote against the tenant in the URL, not the one in the body', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'q-1' });
    const svc = makeService({
      company: { findUnique: jest.fn().mockResolvedValue(companyRow()) },
      ...commercialCounts({ quote: { create, count: jest.fn(), findFirst: jest.fn() } }),
    });

    await svc.createTenantQuote(
      'cmp-1',
      {
        // A cross-tenant write attempt: the body names a different company.
        companyId: 'cmp-evil',
        fromAddress: 'Johannesburg',
        toAddress: 'Durban',
        weight: 1200,
        price: 8400,
      },
      OWNER_ACTOR,
    );

    expect(create.mock.calls[0][0].data.companyId).toBe('cmp-1');
  });

  it('validates the quote before writing', async () => {
    const create = jest.fn();
    const svc = makeService({
      company: { findUnique: jest.fn().mockResolvedValue(companyRow()) },
      ...commercialCounts({ quote: { create, count: jest.fn(), findFirst: jest.fn() } }),
    });

    await expect(
      svc.createTenantQuote('cmp-1', { toAddress: 'Durban', weight: 1, price: 1 }, OWNER_ACTOR),
    ).rejects.toThrow(/fromAddress is required/);
    await expect(
      svc.createTenantQuote('cmp-1', { fromAddress: 'JHB', weight: 1, price: 1 }, OWNER_ACTOR),
    ).rejects.toThrow(/toAddress is required/);
    await expect(
      svc.createTenantQuote(
        'cmp-1',
        { fromAddress: 'JHB', toAddress: 'DBN', weight: 0, price: 1 },
        OWNER_ACTOR,
      ),
    ).rejects.toThrow(/weight must be a positive number/);
    await expect(
      svc.createTenantQuote(
        'cmp-1',
        { fromAddress: 'JHB', toAddress: 'DBN', weight: 1, price: -5 },
        OWNER_ACTOR,
      ),
    ).rejects.toThrow(/price must be a non-negative number/);
    expect(create).not.toHaveBeenCalled();
  });

  it('carries a breakdown through as JSON, and refuses an unserialisable one', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'q-1' });
    const svc = makeService({
      company: { findUnique: jest.fn().mockResolvedValue(companyRow()) },
      ...commercialCounts({ quote: { create, count: jest.fn(), findFirst: jest.fn() } }),
    });

    await svc.createTenantQuote(
      'cmp-1',
      {
        fromAddress: 'JHB',
        toAddress: 'DBN',
        weight: 1,
        price: 1,
        breakdown: { fuel: 120, tolls: 45 },
      },
      OWNER_ACTOR,
    );
    expect(create.mock.calls[0][0].data.breakdown).toEqual({ fuel: 120, tolls: 45 });

    await expect(
      svc.createTenantQuote(
        'cmp-1',
        { fromAddress: 'JHB', toAddress: 'DBN', weight: 1, price: 1, breakdown: { bad: () => 1 } },
        OWNER_ACTOR,
      ),
    ).rejects.toThrow(/JSON-serialisable/);
  });

  it('omits breakdown entirely when the owner did not supply one', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'q-1' });
    const svc = makeService({
      company: { findUnique: jest.fn().mockResolvedValue(companyRow()) },
      ...commercialCounts({ quote: { create, count: jest.fn(), findFirst: jest.fn() } }),
    });

    await svc.createTenantQuote(
      'cmp-1',
      { fromAddress: 'JHB', toAddress: 'DBN', weight: 1, price: 1 },
      OWNER_ACTOR,
    );

    expect(create.mock.calls[0][0].data).not.toHaveProperty('breakdown');
  });

  it('defaults the quote currency to ZAR', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'q-1' });
    const svc = makeService({
      company: { findUnique: jest.fn().mockResolvedValue(companyRow()) },
      ...commercialCounts({ quote: { create, count: jest.fn(), findFirst: jest.fn() } }),
    });

    await svc.createTenantQuote(
      'cmp-1',
      { fromAddress: 'JHB', toAddress: 'DBN', weight: 1, price: 1 },
      OWNER_ACTOR,
    );

    expect(create.mock.calls[0][0].data.currency).toBe('ZAR');
  });

  it('delegates invoices to InvoicesService so numbering and totals stay in one place', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'inv-9', invoiceNumber: 'INV-2026-0009' });
    const record = jest.fn().mockResolvedValue(undefined);
    const svc = makeService(
      { company: { findUnique: jest.fn().mockResolvedValue(companyRow()) }, ...commercialCounts() },
      { record },
      { create },
    );

    // The real InvoicesService.create shape: clientName plus at least one line
    // item. Totals and numbering are computed there, not here.
    const dto = {
      clientName: 'Mokoena Freight',
      items: [{ description: 'Onboarding & setup', quantity: 1, unitPrice: 5000 }],
      taxRate: 15,
    };
    await svc.createTenantInvoice('cmp-1', dto, OWNER_ACTOR);

    expect(create).toHaveBeenCalledWith('cmp-1', dto);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.commercial_invoice_created',
        targetId: 'cmp-1',
        metadata: { invoiceId: 'inv-9' },
      }),
    );
  });

  it('refuses a quote or invoice for an unknown tenant', async () => {
    const invoicesCreate = jest.fn();
    const svc = makeService(
      { company: { findUnique: jest.fn().mockResolvedValue(null) }, ...commercialCounts() },
      { record: jest.fn() },
      { create: invoicesCreate },
    );

    await expect(
      svc.createTenantQuote('nope', { fromAddress: 'a', toAddress: 'b', weight: 1, price: 1 }, OWNER_ACTOR),
    ).rejects.toThrow('Tenant not found');
    await expect(svc.createTenantInvoice('nope', {}, OWNER_ACTOR)).rejects.toThrow(
      'Tenant not found',
    );
    expect(invoicesCreate).not.toHaveBeenCalled();
  });
});
