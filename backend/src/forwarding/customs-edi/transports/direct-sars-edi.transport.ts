import { Injectable } from '@nestjs/common';
import { CustomsEdiTransport, CustomsEdiTransportResult, DecryptedCredential } from '../customs-edi-transport';

/**
 * Direct SARS EDI for tenants who are themselves registered EDI users.
 *
 * FAIL-CLOSED until a real accredited SARS endpoint is wired (spec task 9).
 * Requires SARS EDI-user accreditation; it never fakes an acknowledgement.
 */
@Injectable()
export class DirectSarsEdiTransport implements CustomsEdiTransport {
  readonly path = 'DIRECT_EDI';

  async verify(cred: DecryptedCredential): Promise<{ ok: boolean; reason?: string }> {
    if (!cred.customsClientCode) {
      return { ok: false, reason: 'A SARS customs client code is required for direct EDI.' };
    }
    return {
      ok: false,
      reason: 'Direct SARS EDI requires an accredited gateway endpoint, which is not yet wired (spec task 9).',
    };
  }

  async transmit(): Promise<CustomsEdiTransportResult> {
    return {
      accepted: false,
      lodged: false,
      note: 'Not lodged: direct SARS EDI is not yet wired (spec task 9). Use clearing-agent handoff in the meantime.',
    };
  }
}
