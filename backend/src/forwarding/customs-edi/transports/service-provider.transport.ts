import { Injectable } from '@nestjs/common';
import { CustomsEdiTransport, CustomsEdiTransportResult, DecryptedCredential } from '../customs-edi-transport';

/**
 * Transmits via a SARS-approved EDI service provider / VAN using the tenant's
 * own API credentials.
 *
 * FAIL-CLOSED until a real VAN connector is implemented (spec task 8). It never
 * fakes a SARS acknowledgement — `lodged` stays false and the note is explicit.
 */
@Injectable()
export class ServiceProviderEdiTransport implements CustomsEdiTransport {
  readonly path = 'SERVICE_PROVIDER';

  async verify(cred: DecryptedCredential): Promise<{ ok: boolean; reason?: string }> {
    if (!cred.endpointUrl || !cred.secret) {
      return { ok: false, reason: 'Provider endpoint URL and API key are both required.' };
    }
    return {
      ok: false,
      reason: 'Service-provider connector is configured but the live VAN integration is not yet implemented (spec task 8).',
    };
  }

  async transmit(): Promise<CustomsEdiTransportResult> {
    return {
      accepted: false,
      lodged: false,
      note: 'Not lodged: the service-provider EDI connector is not yet implemented (spec task 8). Use clearing-agent handoff in the meantime.',
    };
  }
}
