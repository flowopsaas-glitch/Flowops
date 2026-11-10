import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { CompaniesService } from './companies.service';

/**
 * PATCH /companies/:id and PATCH /companies/my-company are the same operation
 * reached by two routes. They had drifted apart: updateMyCompany had been
 * hardened with a field allowlist and a white-label entitlement check, while
 * `update` still only stripped `id` and spread the rest into the Prisma write.
 *
 * The gap matters because the loose route is the more exposed one — it is
 * reachable by MANAGER, not only ADMIN/COMPANY_ADMIN. A manager could have
 * sent:
 *
 *   { "plan": "enterprise" }        → self-served a plan upgrade
 *   { "priceOverrideZar": 0 }       → zeroed their own bill
 *   { "trialEndsAt": null }         → removed their trial expiry
 *   { "isActive": true }            → un-suspended themselves
 *   { "featureOverrides": {...} }   → unlocked paid capabilities
 *   { "portalSubdomain": "acme" }   → got paid white-labelling for free
 *
 * None of those need admin rights, none touch another tenant, and none show up
 * as an anomaly anywhere — the tenant simply has a better plan than they pay
 * for. That is why these assertions look at the ARGUMENTS handed to Prisma
 * rather than at the response: the bug is what gets written.
 *
 * Every test here fails against the unhardened `update`.
 */

const BILLING_CONTROLLED = [
  'plan',
  'priceOverrideZar',
  'trialEndsAt',
  'trialStartedAt',
  'isActive',
  'featureOverrides',
];

function makeHarness(hasWhiteLabel = false) {
  const writes: any[] = [];
  const prisma: any = {
    company: {
      update: jest.fn(async ({ where, data }: any) => {
        writes.push({ where, data });
        return { id: where.id, ...data };
      }),
    },
  };
  const billing = {
    hasFeature: jest.fn(async (_companyId: string, feature: string) =>
      feature === 'whiteLabel' ? hasWhiteLabel : false,
    ),
  };

  const svc = Object.create(CompaniesService.prototype) as CompaniesService;
  Object.assign(svc as any, { prisma, billing });

  return { svc, prisma, billing, writes, lastWrite: () => writes[writes.length - 1] };
}

describe('CompaniesService.update — billing fields are never self-writable', () => {
  for (const field of BILLING_CONTROLLED) {
    it(`refuses to let a tenant write ${field}`, async () => {
      const { svc, lastWrite } = makeHarness();

      await svc.update('co-1', { [field]: 'attacker-value' });

      expect(lastWrite().data).not.toHaveProperty(field);
    });
  }

  it('refuses a plan upgrade even when bundled with a legitimate field', async () => {
    const { svc, lastWrite } = makeHarness();

    await svc.update('co-1', { name: 'Acme Logistics', plan: 'enterprise' });

    expect(lastWrite().data.name).toBe('Acme Logistics');
    expect(lastWrite().data).not.toHaveProperty('plan');
  });

  it('refuses to strip the id by other means', async () => {
    const { svc, lastWrite } = makeHarness();
    await svc.update('co-1', { id: 'other-company', name: 'Acme' });
    // id may only ever appear in the WHERE clause, never in the data.
    expect(lastWrite().data).not.toHaveProperty('id');
    expect(lastWrite().where.id).toBe('co-1');
  });

  it('still writes the profile fields a tenant is allowed to edit', async () => {
    const { svc, lastWrite } = makeHarness();

    await svc.update('co-1', {
      name: 'Acme Logistics',
      tradingName: 'Acme',
      vatNumber: '4012345678',
      slaWarningMinutes: 45,
    });

    expect(lastWrite().data).toMatchObject({
      name: 'Acme Logistics',
      tradingName: 'Acme',
      vatNumber: '4012345678',
      slaWarningMinutes: 45,
    });
  });
});

describe('CompaniesService.update — white-label entitlement', () => {
  it('blocks portal re-branding on a plan without white-label, as updateMyCompany does', async () => {
    const { svc, writes } = makeHarness(false);

    await expect(
      svc.update('co-1', { portalSubdomain: 'acme', portalBrandName: 'Acme' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Nothing was written at all.
    expect(writes).toHaveLength(0);
  });

  it('allows portal re-branding when the plan includes white-label', async () => {
    const { svc, lastWrite } = makeHarness(true);

    await svc.update('co-1', { portalSubdomain: 'acme' });

    expect(lastWrite().data.portalSubdomain).toBe('acme');
  });

  it('does not charge for in-app branding that every tier gets', async () => {
    const { svc, lastWrite } = makeHarness(false);

    await svc.update('co-1', { logoUrl: 'https://cdn/logo.png', primaryColor: '#123456' });

    expect(lastWrite().data.logoUrl).toBe('https://cdn/logo.png');
    expect(lastWrite().data.primaryColor).toBe('#123456');
  });
});

describe('the two routes stay consistent with each other', () => {
  it('update and updateMyCompany accept exactly the same fields', async () => {
    // If these ever diverge again, the looser route becomes the bypass.
    const payload = {
      name: 'Acme',
      plan: 'enterprise',
      isActive: false,
      priceOverrideZar: 0,
      portalSubdomain: 'acme',
    };

    const a = makeHarness(true);
    await a.svc.update('co-1', { ...payload });
    const b = makeHarness(true);
    await b.svc.updateMyCompany('co-1', { ...payload });

    expect(Object.keys(a.lastWrite().data).sort()).toEqual(
      Object.keys(b.lastWrite().data).sort(),
    );
    expect(a.lastWrite().data).not.toHaveProperty('plan');
    expect(b.lastWrite().data).not.toHaveProperty('plan');
  });
});
