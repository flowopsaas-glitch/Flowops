import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateDisbursementDto,
  RecoverDisbursementDto,
  UpdateDisbursementDto,
} from './disbursement.dto';

/**
 * Money paid out to an authority on a client's behalf.
 *
 * `update` was:
 *
 *     const { id: _i, companyId: _c, ...data } = dto ?? {};
 *     prisma.disbursement.update({ where: { id }, data });
 *
 * Two keys stripped, everything else written. That left `recoveredAt` and both
 * timestamps caller-settable — so a client could backdate a payment, or write
 * `recoveredAt` directly and make a disbursement look settled without ever
 * going through `markRecovered`.
 *
 * `status` stays writable (the service has its own guarded route too), but is
 * now constrained to the enum, and `recoveredAt` is not writable at all.
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

describe('create', () => {
  it('accepts a disbursement', async () => {
    const dto = await through(CreateDisbursementDto, {
      amount: 4250,
      authority: 'SARS',
      category: 'DUTY',
      clientName: 'Acme Freight',
      reference: 'SARS-88213',
    });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('requires an amount', async () => {
    const dto = await through(CreateDisbursementDto, { authority: 'SARS' });
    expect(await errorsFor(dto)).toContain('amount');
  });

  it('rejects a non-numeric amount, which would become NaN in a Float column', async () => {
    const dto = await through(CreateDisbursementDto, { amount: 'lots' });
    expect(await errorsFor(dto)).toContain('amount');
  });

  it('rejects a negative amount', async () => {
    const dto = await through(CreateDisbursementDto, { amount: -1 });
    expect(await errorsFor(dto)).toContain('amount');
  });

  it('rejects a status outside the enum', async () => {
    const dto = await through(CreateDisbursementDto, { amount: 1, status: 'PAID_IN_FULL' });
    expect(await errorsFor(dto)).toContain('status');
  });
});

describe('update — the two-key destructure', () => {
  it('accepts a legitimate edit', async () => {
    const dto = await through(UpdateDisbursementDto, { amount: 5000, reference: 'SARS-99999' });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('refuses to let a caller backdate recovery or timestamps', async () => {
    const dto = await strip(UpdateDisbursementDto, {
      amount: 5000,
      id: 'attacker-id',
      companyId: 'other-tenant',
      recoveredAt: '2020-01-01T00:00:00Z',
      createdAt: '1999-01-01T00:00:00Z',
      updatedAt: '1999-01-01T00:00:00Z',
    });
    expect(dto.amount).toEqual(5000);
    for (const k of ['id', 'companyId', 'recoveredAt', 'createdAt', 'updatedAt']) {
      expect(dto[k]).toBeUndefined();
    }
  });

  it('still allows a status change, but only to a real status', async () => {
    const ok = await through(UpdateDisbursementDto, { status: 'INVOICED' });
    expect(await errorsFor(ok)).toEqual([]);

    const bad = await through(UpdateDisbursementDto, { status: 'RECOVERED_SECRETLY' });
    expect(await errorsFor(bad)).toContain('status');
  });

  it('lets invoiceId be null to unlink', async () => {
    // The service distinguishes undefined (leave alone) from null (unlink),
    // so null must survive validation.
    const dto = await through(UpdateDisbursementDto, { invoiceId: null });
    expect(await errorsFor(dto)).toEqual([]);
  });
});

describe('recover', () => {
  it('accepts a recovery with an invoice', async () => {
    const dto = await through(RecoverDisbursementDto, { invoiceId: 'inv-1' });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('accepts a recovery with no invoice', async () => {
    const dto = await through(RecoverDisbursementDto, {});
    expect(await errorsFor(dto)).toEqual([]);
  });
});
