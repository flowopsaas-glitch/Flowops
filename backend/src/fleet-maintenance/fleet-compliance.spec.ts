import { BadRequestException } from '@nestjs/common';
import { assertFleetDispatchAllowed, decideFleetCompliance } from './fleet-compliance';

describe('fleet compliance decision', () => {
  const driver = {
    id: 'driver-1',
    companyId: 'company-1',
    currentKm: 10_000,
    nextServiceKm: 12_000,
    nextServiceDate: null,
  };

  it('allows a driver whose maintenance is current', () => {
    expect(decideFleetCompliance(driver, new Date('2026-01-01'))).toMatchObject({
      compliant: true,
      allowed: true,
    });
  });

  it('blocks an overdue driver', () => {
    expect(() => assertFleetDispatchAllowed(
      { ...driver, currentKm: 12_000 },
      new Date('2026-01-01'),
    )).toThrow(BadRequestException);
  });

  it('requires a reason for an explicit non-compliant authorization', () => {
    expect(decideFleetCompliance(
      { ...driver, nextServiceDate: '2025-12-31' },
      new Date('2026-01-01'),
      { allowNonCompliant: true },
    ).allowed).toBe(false);

    expect(decideFleetCompliance(
      { ...driver, nextServiceDate: '2025-12-31' },
      new Date('2026-01-01'),
      { allowNonCompliant: true, reason: 'Emergency recovery route' },
    )).toMatchObject({ compliant: false, allowed: true });
  });
});
