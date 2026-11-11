import { EncryptedSecret } from '../integrations/integration-crypto.service';

/**
 * Envelope format for an OAuth token stored in a SINGLE database column.
 *
 * `IntegrationCredential` can spread an AES-256-GCM secret over three columns
 * (secretCiphertext / secretIv / secretAuthTag). `AccountingConnection` has one
 * column per token, so the three parts are packed into one self-describing
 * string instead:
 *
 *     v1.<iv base64>.<authTag base64>.<ciphertext base64>
 *
 * Keeping it in one column matters for correctness, not just tidiness: the
 * ciphertext, IV and auth tag are a single unit. Spread across three columns a
 * partial write — ciphertext updated but IV left behind — yields a value that
 * is undecryptable with no error at write time. Packed together the value is
 * all-or-nothing, and `disconnect()` nulling a token stays a one-field update.
 *
 * Base64 never emits '.', so splitting on it is unambiguous.
 */

const VERSION = 'v1';
const SEP = '.';
const ENVELOPE_RE = /^v\d+\.[^.]+\.[^.]+\.[^.]+$/;

/** True when `stored` is a sealed envelope rather than a legacy clear token. */
export function isSealedToken(stored: unknown): boolean {
  return typeof stored === 'string' && ENVELOPE_RE.test(stored);
}

/** Pack an AES-256-GCM secret into the single-column envelope. */
export function encodeEnvelope(secret: EncryptedSecret): string {
  return [VERSION, secret.iv, secret.authTag, secret.ciphertext].join(SEP);
}

/**
 * Unpack an envelope. Throws on anything malformed so the caller can treat a
 * value it cannot parse as distinct from one it cannot decrypt — the first is a
 * bug or tampering, the second is a key problem.
 */
export function decodeEnvelope(stored: string): EncryptedSecret {
  const parts = stored.split(SEP);
  if (parts.length !== 4) {
    throw new Error(`Malformed token envelope (${parts.length} parts, expected 4).`);
  }
  const [, iv, authTag, ciphertext] = parts;
  if (!iv || !authTag || !ciphertext) {
    throw new Error('Malformed token envelope (empty component).');
  }
  return { iv, authTag, ciphertext };
}
