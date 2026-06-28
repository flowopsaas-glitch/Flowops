import { Injectable } from '@nestjs/common';
import { CustomsEdiTransport, CustomsEdiTransportResult, DecryptedCredential } from '../customs-edi-transport';

/**
 * Fallback when a tenant has configured no transmission method. Preserves the
 * original honest behaviour: nothing is lodged, and the note tells the operator
 * exactly what to do.
 */
@Injectable()
export class NullCustomsEdiTransport implements CustomsEdiTransport {
  readonly path = 'NONE';

  async verify(): Promise<{ ok: boolean; reason?: string }> {
    return { ok: false, reason: 'No SARS transmission method is configured for this company.' };
  }

  async transmit(): Promise<CustomsEdiTransportResult> {
    return {
      accepted: false,
      lodged: false,
      note: 'Not lodged: no SARS transmission method is configured. Set one up under Customs ▸ SARS EDI, or use a clearing agent.',
    };
  }
}
