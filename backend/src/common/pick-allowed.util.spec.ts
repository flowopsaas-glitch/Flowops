import { pickAllowed } from './pick-allowed.util';

describe('pickAllowed (mass-assignment guard)', () => {
  const ALLOWED = ['name', 'basePrice', 'isActive'] as const;

  it('keeps only allowlisted fields', () => {
    const out = pickAllowed({ name: 'Std', basePrice: 100, isActive: true }, ALLOWED);
    expect(out).toEqual({ name: 'Std', basePrice: 100, isActive: true });
  });

  it('drops fields not on the allowlist (id, companyId, timestamps, plan)', () => {
    const out = pickAllowed(
      { name: 'Std', id: 'hacked', companyId: 'other-co', createdAt: new Date(), plan: 'enterprise', priceOverrideZar: 0 },
      ALLOWED,
    );
    expect(out).toEqual({ name: 'Std' });
    expect(out).not.toHaveProperty('id');
    expect(out).not.toHaveProperty('companyId');
    expect(out).not.toHaveProperty('plan');
    expect(out).not.toHaveProperty('priceOverrideZar');
  });

  it('omits keys whose value is undefined (so Prisma partial updates are clean)', () => {
    const out = pickAllowed({ name: 'Std', basePrice: undefined }, ALLOWED);
    expect(out).toEqual({ name: 'Std' });
    expect(out).not.toHaveProperty('basePrice');
  });

  it('handles null/non-object input safely', () => {
    expect(pickAllowed(null, ALLOWED)).toEqual({});
    expect(pickAllowed(undefined, ALLOWED)).toEqual({});
    expect(pickAllowed('nope' as any, ALLOWED)).toEqual({});
  });

  it('preserves falsy-but-valid values (0, false, empty string)', () => {
    const out = pickAllowed({ name: '', basePrice: 0, isActive: false }, ALLOWED);
    expect(out).toEqual({ name: '', basePrice: 0, isActive: false });
  });
});
