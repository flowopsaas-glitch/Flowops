import 'reflect-metadata'; // must precede class-transformer's decorators
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateQuoteDto } from './create-quote.dto';

/**
 * The outer layer of the quotes fix.
 *
 * #512 fixed the money maths in the service, and the service still defends
 * itself. This is the edge: with `body: any` the global ValidationPipe had no
 * metatype to work with, so nothing rejected a negative weight until it had
 * already been multiplied by a price.
 */

const check = async (payload: Record<string, unknown>) => {
  const dto = plainToInstance(CreateQuoteDto, payload);
  const errors = await validate(dto);
  return { valid: errors.length === 0, fields: errors.map((e) => e.property) };
};

describe('CreateQuoteDto', () => {
  it('accepts a well-formed quote', async () => {
    const { valid } = await check({
      fromAddress: '1 Main Rd, Johannesburg',
      toAddress: '42 Beach Rd, Cape Town',
      weight: 5,
      clientName: 'Acme',
    });
    expect(valid).toBe(true);
  });

  it('rejects a negative weight at the edge, before it reaches the money', async () => {
    // This is the value that produced a quote of -R1420.
    const { valid, fields } = await check({
      fromAddress: 'a', toAddress: 'b', weight: -100,
    });
    expect(valid).toBe(false);
    expect(fields).toContain('weight');
  });

  it('coerces a numeric string, as a form field arrives', async () => {
    const dto = plainToInstance(CreateQuoteDto, {
      fromAddress: 'a', toAddress: 'b', weight: '5',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.weight).toEqual(5);
  });

  it('accepts a weight of zero', async () => {
    // Zero is legitimate; only negative is not. Guarding this with `|| 1`
    // is what broke the breakdown's arithmetic in #512.
    const { valid } = await check({ fromAddress: 'a', toAddress: 'b', weight: 0 });
    expect(valid).toBe(true);
  });

  it('rejects a non-numeric weight', async () => {
    const { valid, fields } = await check({ fromAddress: 'a', toAddress: 'b', weight: 'abc' });
    expect(valid).toBe(false);
    expect(fields).toContain('weight');
  });

  it('rejects a missing address', async () => {
    const { valid, fields } = await check({ toAddress: 'b', weight: 1 });
    expect(valid).toBe(false);
    expect(fields).toContain('fromAddress');
  });

  it('treats clientName as optional', async () => {
    const { valid } = await check({ fromAddress: 'a', toAddress: 'b', weight: 1 });
    expect(valid).toBe(true);
  });
});
