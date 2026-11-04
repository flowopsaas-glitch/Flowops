import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CompleteJobDto, CreateJobDto, ListJobsQuery } from './maintenance.dto';

/**
 * Query-string and JSON coercion.
 *
 * These exist because the obvious decorator is wrong: `@Type(() => Boolean)`
 * turns the string `'false'` into `true`, so an unchecked filter would have
 * silently narrowed a list. A wrong filter is quiet — it returns fewer rows and
 * looks like an empty queue.
 */
function instantiate<T extends object>(cls: new () => T, plain: Record<string, unknown>): T {
  return plainToInstance(cls, plain, { enableImplicitConversion: false });
}

describe('ListJobsQuery', () => {
  it('keeps comebacksOnly=false as false', () => {
    const query = instantiate(ListJobsQuery, { comebacksOnly: 'false' });
    expect(query.comebacksOnly).toBe(false);
  });

  it('reads comebacksOnly=true from the query string', () => {
    expect(instantiate(ListJobsQuery, { comebacksOnly: 'true' }).comebacksOnly).toBe(true);
  });

  it('passes a real boolean through untouched', () => {
    expect(instantiate(ListJobsQuery, { comebacksOnly: false }).comebacksOnly).toBe(false);
  });

  it('leaves the filter unset when it is absent', () => {
    expect(instantiate(ListJobsQuery, {}).comebacksOnly).toBeUndefined();
  });
});

describe('CreateJobDto', () => {
  it('requires a fault description of at least three characters', () => {
    const errors = validateSync(
      instantiate(CreateJobDto, { assetId: 'asset-1', type: 'BREAKDOWN', faultDescription: 'ok' }),
    );
    expect(errors.some((error) => error.property === 'faultDescription')).toBe(true);
  });

  it('accepts a normal card', () => {
    const errors = validateSync(
      instantiate(CreateJobDto, {
        assetId: 'asset-1',
        type: 'BREAKDOWN',
        faultDescription: 'Hydraulic oil leaking at the boom cylinder',
      }),
    );
    expect(errors).toHaveLength(0);
  });
});

describe('CompleteJobDto', () => {
  it('refuses a warranty term that cannot be priced — "lifetime" is not a number', () => {
    const errors = validateSync(
      instantiate(CompleteJobDto, { workPerformed: 'Replaced seal kit', warrantyTermDays: 'lifetime' }),
    );
    expect(errors.some((error) => error.property === 'warrantyTermDays')).toBe(true);
  });

  it('accepts a term in days', () => {
    const errors = validateSync(instantiate(CompleteJobDto, { workPerformed: 'Replaced seal kit', warrantyTermDays: 30 }));
    expect(errors).toHaveLength(0);
  });
});
