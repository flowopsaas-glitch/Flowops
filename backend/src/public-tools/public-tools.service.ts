import { Injectable } from '@nestjs/common';
import {
  estimateImportDuty,
  SA_IMPORT_UPLIFTMENT,
  SA_VAT_RATE,
  type DutyLineInput,
} from './sa-import-duty';
import { findHsCode, HS_DISCLAIMER, searchHsCodes } from './hs-codes.data';

/**
 * Public freight tools.
 *
 * Free calculators that answer the question a South African importer actually
 * types into Google long before they talk to anyone: "what will this cost me
 * landed?" They are unauthenticated on purpose — they are the top of the
 * funnel, not a feature behind a login.
 *
 * Two rules:
 *
 *  1. Never overstate certainty. Every result carries the disclaimer. A
 *     prospect who under-quotes a landed cost on our say-so does not come
 *     back, and we would have earned that.
 *
 *  2. Same arithmetic as the product. Duty is computed by
 *     `sa-import-duty.ts`, the shared function behind the in-product customs
 *     estimate. A public figure that disagreed with the figure a paying
 *     client sees would be worse than having no calculator at all.
 */

export type EstimateLineDto = {
  customsValue: number;
  dutyRatePct: number;
  description?: string;
  hsCode?: string;
  quantity?: number;
};

@Injectable()
export class PublicToolsService {
  /** Constants the UI needs so it labels its own inputs correctly. */
  rates() {
    return {
      currency: 'ZAR',
      vatRatePct: SA_VAT_RATE * 100,
      upliftmentPct: SA_IMPORT_UPLIFTMENT * 100,
      disclaimer: HS_DISCLAIMER,
    };
  }

  /**
   * Estimate duty and VAT.
   *
   * Accepted with or without an HS code: passing one pre-fills the indicative
   * rate, and an explicit `dutyRatePct` always wins, because a professional
   * who has confirmed the real line must be able to override us.
   */
  estimate(lines: EstimateLineDto[]) {
    const resolved: DutyLineInput[] = lines.map((l) => {
      const fromCode = l.hsCode ? findHsCode(l.hsCode) : undefined;
      const explicit = typeof l.dutyRatePct === 'number';
      return {
        customsValue: l.customsValue,
        dutyRatePct: explicit ? l.dutyRatePct : (fromCode?.indicativeRatePct ?? 0),
        description: l.description ?? fromCode?.description,
        hsCode: l.hsCode,
        quantity: l.quantity,
      };
    });

    const estimate = estimateImportDuty(resolved);
    return { ...estimate, disclaimer: HS_DISCLAIMER };
  }

  /** Search the HS reference set. */
  search(query: string, limit?: number) {
    return {
      results: searchHsCodes(query ?? '', limit ?? 25),
      disclaimer: HS_DISCLAIMER,
    };
  }
}
