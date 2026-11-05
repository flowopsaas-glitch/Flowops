import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CompleteJobDto,
  CreateAssetDto,
  CreateJobDto,
  ListJobsQuery,
  UpdateAssetDto,
  UpdateCommercialDto,
} from './maintenance.dto';

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

describe('CreateAssetDto — the supplier warranty', () => {
  const base = { assetCode: 'RTG-07', assetClass: 'RTG' };

  it('accepts 30 months as a number of days', () => {
    const errors = validateSync(instantiate(CreateAssetDto, { ...base, warrantyTermDays: 913 }));
    expect(errors).toHaveLength(0);
  });

  it('refuses a term longer than ten years, which is the word "lifetime" in disguise', () => {
    const errors = validateSync(instantiate(CreateAssetDto, { ...base, warrantyTermDays: 4000 }));
    expect(errors.some((e) => e.property === 'warrantyTermDays')).toBe(true);
  });

  it('refuses a service interval past five years', () => {
    const errors = validateSync(instantiate(CreateAssetDto, { ...base, warrantyServiceIntervalDays: 2000 }));
    expect(errors.some((e) => e.property === 'warrantyServiceIntervalDays')).toBe(true);
  });

  it('refuses a start date that is not a date', () => {
    const errors = validateSync(instantiate(CreateAssetDto, { ...base, warrantyStartAt: 'sometime in 2024' }));
    expect(errors.some((e) => e.property === 'warrantyStartAt')).toBe(true);
  });

  it('accepts a unit with no warranty at all — that is a fact, not an error', () => {
    expect(validateSync(instantiate(CreateAssetDto, base))).toHaveLength(0);
  });
});

describe('UpdateAssetDto — withdrawing a term', () => {
  it('accepts null, which is how a term recorded against the wrong unit is corrected', () => {
    const dto = instantiate(UpdateAssetDto, { warrantyTermDays: null, warrantyStartAt: null });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.warrantyTermDays).toBeNull();
  });

  it('still refuses a term that cannot be priced', () => {
    const errors = validateSync(instantiate(UpdateAssetDto, { warrantyTermDays: 99999 }));
    expect(errors.some((e) => e.property === 'warrantyTermDays')).toBe(true);
  });
});

describe('UpdateCommercialDto — the chain at the edge', () => {
  it('accepts a quotation on its own — a contractor records the step he is in', () => {
    const errors = validateSync(instantiate(UpdateCommercialDto, { quotationAmount: 42500 }));
    expect(errors).toHaveLength(0);
  });

  it('refuses a quotation of zero before it ever reaches the rules', () => {
    const errors = validateSync(instantiate(UpdateCommercialDto, { quotationAmount: 0 }));
    expect(errors.some((e) => e.property === 'quotationAmount')).toBe(true);
  });

  it('refuses a negative quotation', () => {
    const errors = validateSync(instantiate(UpdateCommercialDto, { quotationAmount: -100 }));
    expect(errors.some((e) => e.property === 'quotationAmount')).toBe(true);
  });

  it('refuses a date that is not a date', () => {
    const errors = validateSync(instantiate(UpdateCommercialDto, { purchaseOrderAt: 'last Tuesday' }));
    expect(errors.some((e) => e.property === 'purchaseOrderAt')).toBe(true);
  });

  it('passes null through untouched — that is how a wrong entry is withdrawn', () => {
    const dto = instantiate(UpdateCommercialDto, { quotationAmount: null, paidAt: null });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.quotationAmount).toBeNull();
    expect(dto.paidAt).toBeNull();
  });

  it('accepts a full chain in one request', () => {
    const errors = validateSync(
      instantiate(UpdateCommercialDto, {
        quotationAmount: 42500,
        quotationAt: '2026-11-02T09:00:00.000Z',
        purchaseOrderNumber: 'PO-2026-118423',
        purchaseOrderAt: '2026-11-06T09:00:00.000Z',
        invoicedAt: '2026-11-12T09:00:00.000Z',
        paidAt: '2026-12-12T09:00:00.000Z',
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('refuses an order reference long enough to be a paragraph', () => {
    const errors = validateSync(instantiate(UpdateCommercialDto, { purchaseOrderNumber: 'x'.repeat(81) }));
    expect(errors.some((e) => e.property === 'purchaseOrderNumber')).toBe(true);
  });
});
