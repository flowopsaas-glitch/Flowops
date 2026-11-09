/**
 * South African import duty and VAT — the shared calculation.
 *
 * This is the same formula `forwarding/customs.service.ts` uses inside the
 * product, kept here as a pure function so the public calculator and the
 * customer-facing estimate cannot drift apart. A prospect who runs a number
 * through the free tool and then sees a different figure once they are a
 * paying client has been told something false by our own software, so the
 * arithmetic lives in exactly one place.
 *
 * THE FORMULA
 *
 *   duty         = customsValue x dutyRate
 *   ATV          = (customsValue x 1.10) + duty       <- 10% import upliftment
 *   vat          = ATV x 15%
 *   totalPayable = duty + vat
 *
 * The 10% upliftment is what makes SA different from a naive "VAT on value"
 * calculation, and it is the single easiest thing to get wrong: VAT is charged
 * on the Added Tax Value, not the bare customs value.
 *
 * It is an ESTIMATE. The binding figure is SARS's assessment on the SAD
 * declaration, which can differ on valuation method, rebates, preferential
 * origin (SADC / EU / AfCFTA), anti-dumping duties and a dozen other things
 * this deliberately does not attempt to model.
 */

export const SA_VAT_RATE = 0.15;
export const SA_IMPORT_UPLIFTMENT = 0.10;

export type DutyLineInput = {
  /** Customs value in ZAR (transaction value, i.e. the invoiced amount). */
  customsValue: number;
  /** Duty rate as a percentage, e.g. 20 means 20%. */
  dutyRatePct: number;
  description?: string;
  hsCode?: string;
  quantity?: number;
};

export type DutyLineResult = {
  description?: string;
  hsCode?: string;
  quantity?: number;
  customsValue: number;
  dutyRatePct: number;
  duty: number;
  /** Added Tax Value — the base VAT is charged on. */
  atv: number;
  vat: number;
  totalPayable: number;
};

export type DutyEstimate = {
  currency: 'ZAR';
  vatRatePct: number;
  upliftmentPct: number;
  lines: DutyLineResult[];
  totals: {
    customsValue: number;
    duty: number;
    atv: number;
    vat: number;
    totalPayable: number;
  };
};

const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Money-safe coercion: blank, null and NaN all mean zero, never NaN. */
function money(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Estimate duty and VAT for one or more lines.
 *
 * Pure and dependency-free on purpose: no Prisma, no config, no clock. That
 * is what lets the same function back a public endpoint, a customer estimate
 * and a unit test without any of them being able to disagree.
 */
export function estimateImportDuty(lines: DutyLineInput[]): DutyEstimate {
  const results: DutyLineResult[] = lines.map((l) => {
    const customsValue = money(l.customsValue);
    const dutyRatePct = money(l.dutyRatePct);
    const duty = r2(customsValue * (dutyRatePct / 100));
    const atv = r2(customsValue * (1 + SA_IMPORT_UPLIFTMENT) + duty);
    const vat = r2(atv * SA_VAT_RATE);
    return {
      description: l.description,
      hsCode: l.hsCode,
      quantity: l.quantity,
      customsValue: r2(customsValue),
      dutyRatePct,
      duty,
      atv,
      vat,
      totalPayable: r2(duty + vat),
    };
  });

  const totals = results.reduce(
    (a, l) => ({
      customsValue: r2(a.customsValue + l.customsValue),
      duty: r2(a.duty + l.duty),
      atv: r2(a.atv + l.atv),
      vat: r2(a.vat + l.vat),
      totalPayable: r2(a.totalPayable + l.totalPayable),
    }),
    { customsValue: 0, duty: 0, atv: 0, vat: 0, totalPayable: 0 },
  );

  return {
    currency: 'ZAR',
    vatRatePct: SA_VAT_RATE * 100,
    upliftmentPct: SA_IMPORT_UPLIFTMENT * 100,
    lines: results,
    totals,
  };
}
