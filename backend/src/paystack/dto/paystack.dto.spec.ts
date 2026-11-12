import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreatePlanDto, InitializePaymentDto } from './paystack.dto';

/**
 * Paystack bodies — excluding the webhook, which is deliberately exempt. Its
 * gate is an HMAC over the raw body, and a validating DTO there would break the
 * integration the first time Paystack adds a field to its own payload.
 *
 * `initializePayment` is the tenant-facing one: `amount` is in the smallest
 * currency unit (kobo/cents) and is what actually gets charged, so a missing
 * value must not quietly become a zero-rand transaction.
 */

/** Mirrors the global pipe: whitelist on, forbidNonWhitelisted off. */
const through = async <T extends object>(cls: new () => T, payload: Record<string, unknown>) => {
  const dto = plainToInstance(cls, payload) as T;
  await validate(dto, { whitelist: true, forbidNonWhitelisted: false });
  return dto;
};

const errorsFor = async (obj: object) => (await validate(obj)).map((e) => e.property);

describe('initializePayment', () => {
  it('accepts an amount in the smallest currency unit', async () => {
    const dto = await through(InitializePaymentDto, { amount: 450000, invoiceId: 'inv-1' });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('requires an amount', async () => {
    // This is the value that gets charged. An absent one must not be a
    // silent zero.
    const dto = await through(InitializePaymentDto, { invoiceId: 'inv-1' });
    expect(await errorsFor(dto)).toContain('amount');
  });

  it('rejects a zero amount', async () => {
    const dto = await through(InitializePaymentDto, { amount: 0 });
    expect(await errorsFor(dto)).toContain('amount');
  });

  it('rejects a fractional amount — kobo are integers', async () => {
    const dto = await through(InitializePaymentDto, { amount: 4500.5 });
    expect(await errorsFor(dto)).toContain('amount');
  });

  it('rejects an absurd amount', async () => {
    const dto = await through(InitializePaymentDto, { amount: 1e20 });
    expect(await errorsFor(dto)).toContain('amount');
  });

  it('rejects a malformed email', async () => {
    const dto = await through(InitializePaymentDto, { amount: 100, email: 'nope' });
    expect(await errorsFor(dto)).toContain('email');
  });

  it('rejects metadata that is not an object', async () => {
    const dto = await through(InitializePaymentDto, { amount: 100, metadata: 'a string' });
    expect(await errorsFor(dto)).toContain('metadata');
  });
});

describe('createPlan', () => {
  it('accepts a plan', async () => {
    const dto = await through(CreatePlanDto, {
      name: 'Growth monthly',
      amount: 199900,
      interval: 'monthly',
    });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('requires a name, amount and interval', async () => {
    const dto = await through(CreatePlanDto, {});
    expect(await errorsFor(dto).then((e) => e.sort())).toEqual(['amount', 'interval', 'name']);
  });

  it('rejects a negative plan amount', async () => {
    const dto = await through(CreatePlanDto, { name: 'X', amount: -1, interval: 'monthly' });
    expect(await errorsFor(dto)).toContain('amount');
  });
});
