import { CustomsDeclaration } from '@prisma/client';

/** A tenant's transmission config with the secret decrypted (internal use only). */
export interface DecryptedCredential {
  companyId: string;
  path: string; // CustomsEdiPath value, or 'NONE' when nothing is configured
  customsClientCode?: string | null;
  providerName?: string | null;
  endpointUrl?: string | null;
  agentEmail?: string | null;
  secret?: string | null; // decrypted API key / token (SERVICE_PROVIDER / DIRECT_EDI)
}

export interface CustomsEdiTransportResult {
  /** The transport accepted and actioned the request (e.g. package sent to agent). */
  accepted: boolean;
  /**
   * TRUE only when a real SARS acknowledgement was returned. Never set true on a
   * handoff, a fail-closed path, or a missing-credential path — this is the flag
   * the workflow uses to decide whether it may say "lodged with SARS".
   */
  lodged: boolean;
  reference?: string;
  /** Human-readable, always-honest status line surfaced to the operator. */
  note: string;
}

export interface CustomsEdiTransport {
  /** The CustomsEdiPath this transport handles (or 'NONE' for the null transport). */
  readonly path: string;
  verify(cred: DecryptedCredential): Promise<{ ok: boolean; reason?: string }>;
  transmit(cred: DecryptedCredential, declaration: CustomsDeclaration): Promise<CustomsEdiTransportResult>;
}
