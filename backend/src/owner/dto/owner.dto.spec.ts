import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateTenantAdminDto,
  CreateTenantInvoiceDto,
  CreateTenantQuoteDto,
  DraftTenantDto,
  UpdateSubscriptionOverrideDto,
} from './owner.dto';

/**
 * The owner console.
 *
 * `draftTenant` was the widest write in the codebase:
 *
 *     prisma.company.create({ data: { ...dto, isActive: false } })
 *
 * On the Company model that spread could set `id`, `portalSubdomain`,
 * `featureOverrides`, `priceOverrideZar`, `commercialStatus`, `trialEndsAt`.
 * The controller is behind OwnerAuthGuard (which fails closed), so a tenant
 * could never reach it — but a spread with no shape is one refactor away from
 * being reachable. These tests pin the allowlist.
 */

/** Mirrors the global pipe: whitelist on, forbidNonWhitelisted off. */
const through = async <T extends object>(cls: new () => T, payload: Record<string, unknown>) => {
  const dto = plainToInstance(cls, payload) as T;
  await validate(dto, { whitelist: true, forbidNonWhitelisted: false });
  return dto;
};

const errorsFor = async (obj: object) => (await validate(obj)).map((e) => e.property);

const strip = async (cls: new () => object, payload: Record<string, unknown>) =>
  (await through(cls, payload)) as unknown as Record<string, unknown>;

describe('draftTenant — the spread into company.create', () => {
  it('accepts what the owner console sends', async () => {
    const dto = await through(DraftTenantDto, {
      name: 'Acme Freight',
      email: 'ops@acme.co.za',
      phone: '+27123456789',
      plan: 'growth',
      // The UI sends this; the service overrides it to false after the spread,
      // so its presence in the request is harmless.
      isActive: true,
    });
    expect(await errorsFor(dto)).toEqual([]);
    expect(dto.name).toEqual('Acme Freight');
  });

  it('refuses to let a draft set id, billing or commercial fields', async () => {
    // Every one of these is a Company column. None belongs in a draft.
    const dto = await strip(DraftTenantDto, {
      name: 'Acme Freight',
      id: 'attacker-chosen-id',
      portalSubdomain: 'acme',
      featureOverrides: { everything: true },
      priceOverrideZar: 0,
      commercialStatus: 'ENTERPRISE',
      trialEndsAt: '2099-01-01T00:00:00Z',
      subscriptionStatus: 'ACTIVE',
      isActive: false,
      createdAt: '1999-01-01T00:00:00Z',
    });
    for (const k of [
      'id',
      'portalSubdomain',
      'featureOverrides',
      'priceOverrideZar',
      'commercialStatus',
      'trialEndsAt',
      'subscriptionStatus',
      'isActive',
      'createdAt',
    ]) {
      expect(dto[k]).toBeUndefined();
    }
  });

  it('requires a name', async () => {
    const dto = await through(DraftTenantDto, { email: 'ops@acme.co.za' });
    expect(await errorsFor(dto)).toContain('name');
  });

  it('rejects a malformed email', async () => {
    const dto = await through(DraftTenantDto, { name: 'Acme', email: 'not-an-email' });
    expect(await errorsFor(dto)).toContain('email');
  });
});

describe('createTenantAdmin', () => {
  it('accepts a strong password', async () => {
    const dto = await through(CreateTenantAdminDto, {
      name: 'Jane Admin',
      email: 'jane@acme.co.za',
      password: 'correct-horse-battery',
    });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('rejects a short password', async () => {
    const dto = await through(CreateTenantAdminDto, {
      name: 'Jane Admin',
      email: 'jane@acme.co.za',
      password: 'short',
    });
    expect(await errorsFor(dto)).toContain('password');
  });

  it('rejects a password longer than bcrypt can use', async () => {
    // bcrypt silently ignores everything past 72 bytes, so a longer password
    // buys nothing and costs hashing time on every login.
    const dto = await through(CreateTenantAdminDto, {
      name: 'Jane Admin',
      email: 'jane@acme.co.za',
      password: 'x'.repeat(500),
    });
    expect(await errorsFor(dto)).toContain('password');
  });
});

describe('subscription overrides — null and omitted are different writes', () => {
  it('accepts null to clear an override', async () => {
    const dto = await through(UpdateSubscriptionOverrideDto, {
      featureOverrides: null,
      priceOverrideZar: null,
    });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('accepts an empty body', async () => {
    const dto = await through(UpdateSubscriptionOverrideDto, {});
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('rejects a negative price override', async () => {
    const dto = await through(UpdateSubscriptionOverrideDto, { priceOverrideZar: -1 });
    expect(await errorsFor(dto)).toContain('priceOverrideZar');
  });
});

describe('tenant quotes and invoices match what the console sends', () => {
  it('accepts the quote payload from TenantCommercialPanel', async () => {
    const dto = await through(CreateTenantQuoteDto, {
      fromAddress: 'Johannesburg',
      toAddress: 'Durban',
      weight: 1200,
      price: 4500,
      clientName: 'Acme Freight',
    });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('rejects a negative quote price', async () => {
    const dto = await through(CreateTenantQuoteDto, {
      fromAddress: 'JHB',
      toAddress: 'DBN',
      weight: 1,
      price: -1,
    });
    expect(await errorsFor(dto)).toContain('price');
  });

  it('accepts the invoice payload from TenantCommercialPanel', async () => {
    const dto = await through(CreateTenantInvoiceDto, {
      clientName: 'Acme Freight',
      items: [{ description: 'Linehaul', quantity: 1, unitPrice: 4500 }],
    });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('rejects an invoice with no line items', async () => {
    const dto = await through(CreateTenantInvoiceDto, { clientName: 'Acme', items: [] });
    expect(await errorsFor(dto)).toContain('items');
  });

  it('validates the nested line items', async () => {
    const dto = await through(CreateTenantInvoiceDto, {
      clientName: 'Acme',
      items: [{ description: 'Linehaul', quantity: 0, unitPrice: 4500 }],
    });
    const errors = await validate(dto as object);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('strips server-owned fields from invoice items', async () => {
    const dto = (await through(CreateTenantInvoiceDto, {
      clientName: 'Acme',
      items: [{ description: 'Linehaul', quantity: 1, unitPrice: 100, lineTotal: 999999 }],
    })) as unknown as { items: Array<Record<string, unknown>> };
    // Totals are server-authoritative, so a caller-supplied total must not survive.
    expect(dto.items[0].lineTotal).toBeUndefined();
  });
});
