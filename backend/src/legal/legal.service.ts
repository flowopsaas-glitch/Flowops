import { Injectable } from '@nestjs/common';
import {
  FLOWOPS_TERMS_EFFECTIVE_ISO,
  FLOWOPS_TERMS_VERSION,
} from './termsMeta';

@Injectable()
export class LegalService {
  getTermsMeta() {
    return {
      version: FLOWOPS_TERMS_VERSION,
      effectiveDate: FLOWOPS_TERMS_EFFECTIVE_ISO,
      product: 'FlowOps',
      operator: 'FlowOps (Pty) Ltd',
      jurisdiction: 'South Africa',
      documents: {
        termsMarkdownPath: 'legal/TERMS_OF_SERVICE.md',
        privacyMarkdownPath: 'legal/PRIVACY_NOTICE_POPIA.md',
      },
    };
  }

  /**
   * Optional JSON limits per plan key — extend when subscription engine is live.
   * Env: FLOWOPS_TENANT_LIMITS_JSON e.g. {"STARTER":{"maxDrivers":20,"maxWaybillsPerMonth":5000}}
   */
  getConfiguredTenantLimits(): Record<string, Record<string, number>> {
    const raw = process.env.FLOWOPS_TENANT_LIMITS_JSON?.trim();
    if (!raw) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, Record<string, number>>;
      }
    } catch {
      // ignore invalid JSON
    }
    return {};
  }
}
