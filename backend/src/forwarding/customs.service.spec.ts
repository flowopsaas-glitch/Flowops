import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { CustomsService } from './customs.service';
import { estimateImportDuty, SA_VAT_RATE, SA_IMPORT_UPLIFTMENT } from '../public-tools/sa-import-duty';

/**
 * SA import duty arithmetic used to exist three times: once in
 * public-tools/sa-import-duty.ts (backing the public calculator), once here
 * with its own VAT_RATE/UPLIFTMENT constants, and once in rate-shopping as a
 * bare `const VAT_PCT = 0.15`.
 *
 * Three copies of a statutory rate is three places to miss when the rate
 * changes. VAT went 14% -> 15% in April 2018 and will move again; a missed
 * copy means a forwarder quotes a customer the wrong payable and finds out at
 * the SAD.
 *
 * This service now calls the shared implementation. These tests pin two
 * things: the HTTP response shape the frontend already depends on has not
 * changed, and the numbers are the ones the shared helper produces.
 */

const cargo = (over: Partial<any> = {}) => ({
  id: 'cargo-1',
  description: 'Widget',
  hsCode: '8471.30',
  quantity: 2,
  customsValue: 1000,
  dutyRatePct: 10,
  ...over,
});

function makeService(file: any) {
  const prisma: any = {
    shipmentFile: {
      findFirst: jest.fn(async ({ where }: any) =>
        file && where.id === file.id && where.companyId === file.companyId ? file : null,
      ),
    },
  };
  const svc = Object.create(CustomsService.prototype) as CustomsService;
  Object.assign(svc as any, { prisma });
  return { svc, prisma };
}

describe('CustomsService.estimate — single source of duty truth', () => {
  it('returns the shape the frontend already reads', async () => {
    const { svc } = makeService({ id: 'file-1', companyId: 'co-1', cargo: [cargo()] });

    const res: any = await svc.estimate('co-1', 'file-1');

    expect(res.currency).toBe('ZAR');
    expect(res.vatRatePct).toBe(15);
    expect(res.upliftmentPct).toBe(10);
    expect(Array.isArray(res.lines)).toBe(true);
    expect(typeof res.totals.totalPayable).toBe('number');
    expect(res.note).toMatch(/SARS/);
  });

  it('keeps cargoId on every line (the frontend keys rows by it)', async () => {
    const { svc } = makeService({
      id: 'file-1',
      companyId: 'co-1',
      cargo: [cargo({ id: 'c-1' }), cargo({ id: 'c-2', customsValue: 500 })],
    });

    const res: any = await svc.estimate('co-1', 'file-1');

    expect(res.lines.map((l: any) => l.cargoId)).toEqual(['c-1', 'c-2']);
  });

  it('produces exactly what the shared helper produces', async () => {
    const rows = [cargo({ id: 'c-1' }), cargo({ id: 'c-2', customsValue: 2500, dutyRatePct: 0 })];
    const { svc } = makeService({ id: 'file-1', companyId: 'co-1', cargo: rows });

    const res: any = await svc.estimate('co-1', 'file-1');
    const expected = estimateImportDuty(
      rows.map((c) => ({
        description: c.description,
        hsCode: c.hsCode,
        quantity: c.quantity,
        customsValue: c.customsValue,
        dutyRatePct: c.dutyRatePct,
      })),
    );

    expect(res.lines.map((l: any) => l.vat)).toEqual(expected.lines.map((l) => l.vat));
    expect(res.lines.map((l: any) => l.atv)).toEqual(expected.lines.map((l) => l.atv));
    expect(res.totals).toEqual(expected.totals);
  });

  it('computes ATV as uplifted customs value plus duty, and VAT on that', async () => {
    const { svc } = makeService({ id: 'file-1', companyId: 'co-1', cargo: [cargo()] });

    const res: any = await svc.estimate('co-1', 'file-1');
    const line = res.lines[0];

    // customsValue 1000, duty 10% = 100. ATV = 1000 * 1.1 + 100 = 1200. VAT = 180.
    expect(line.duty).toBe(100);
    expect(line.atv).toBe(1200);
    expect(line.vat).toBe(180);
    expect(line.totalPayable).toBe(280);
  });

  it('rounds half-up where toFixed would round down', () => {
    // (1.005).toFixed(2) === "1.00" — Number.toFixed works on the binary
    // float, and 1.005 is stored slightly below. The shared helper adds
    // Number.EPSILON before scaling, so it rounds the way a human would.
    // This is the behavioural difference the refactor introduces.
    expect((1.005).toFixed(2)).toBe('1.00');

    const halfUp = Math.round((1.005 + Number.EPSILON) * 100) / 100;
    expect(halfUp).toBe(1.01);

    // And the helper really does use it: 0.145 -> 0.15, not 0.14.
    const r = estimateImportDuty([{ customsValue: 1, dutyRatePct: 14.5 }]);
    expect(r.lines[0].duty).toBe(0.15);
  });

  it('treats missing customsValue and dutyRatePct as zero, not NaN', async () => {
    const { svc } = makeService({
      id: 'file-1',
      companyId: 'co-1',
      cargo: [cargo({ customsValue: null, dutyRatePct: null })],
    });

    const res: any = await svc.estimate('co-1', 'file-1');

    expect(Number.isNaN(res.lines[0].vat)).toBe(false);
    expect(res.lines[0].duty).toBe(0);
    expect(res.totals.totalPayable).toBe(0);
  });

  it('handles a file with no cargo', async () => {
    const { svc } = makeService({ id: 'file-1', companyId: 'co-1', cargo: [] });
    const res: any = await svc.estimate('co-1', 'file-1');
    expect(res.lines).toEqual([]);
    expect(res.totals.totalPayable).toBe(0);
  });

  it('404s for another tenant’s file', async () => {
    const { svc } = makeService({ id: 'file-1', companyId: 'co-1', cargo: [cargo()] });
    await expect(svc.estimate('co-2', 'file-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('exposes the statutory rates from one place', () => {
    // If these two ever disagree with a literal elsewhere in the codebase,
    // the duplication has come back.
    expect(SA_VAT_RATE).toBe(0.15);
    expect(SA_IMPORT_UPLIFTMENT).toBe(0.1);
  });
});
