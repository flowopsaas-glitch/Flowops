import { IntegrationCryptoService } from '../integrations/integration-crypto.service';
import { decodeEnvelope, encodeEnvelope, isSealedToken } from './accounting-token-cipher';

/**
 * The envelope is the thing standing between a database read and a live OAuth
 * token for a customer's ledger. If it can be confused with a clear token, or
 * parses into something that decrypts to the wrong value, the whole control is
 * decorative — so it gets tested on its own, not only through the service.
 */

const ENC_KEY = '6v2oaLkUu87Wri63V41iaojKoE3vvJqqad+Re1f2IMM=';

// Note: the crypto service reads `config.get(k, '')`, so the fake must return
// the key unconditionally — `'' ?? ENC_KEY` is `''`, which loads no key at all.
const crypto = new IntegrationCryptoService({
  get: (_k: string, _d?: any) => ENC_KEY,
} as any);

describe('accounting token envelope', () => {
  it('round-trips a token through seal and open', () => {
    const sealed = encodeEnvelope(crypto.encrypt('at-live-token'));
    expect(crypto.decrypt(decodeEnvelope(sealed))).toEqual('at-live-token');
  });

  it('never contains the clear token', () => {
    const sealed = encodeEnvelope(crypto.encrypt('at-live-token'));
    expect(sealed).not.toContain('at-live-token');
    // A base64 fragment of the token would still be a partial leak, but the
    // token itself must not appear.
    expect(Buffer.from(sealed, 'utf8').toString('base64')).not.toContain(
      Buffer.from('at-live-token', 'utf8').toString('base64'),
    );
  });

  it('uses a fresh IV each time, so sealing the same token twice differs', () => {
    const a = encodeEnvelope(crypto.encrypt('at-live-token'));
    const b = encodeEnvelope(crypto.encrypt('at-live-token'));
    expect(a).not.toEqual(b);
    expect(crypto.decrypt(decodeEnvelope(b))).toEqual('at-live-token');
  });

  it('recognises its own envelope and nothing else', () => {
    const sealed = encodeEnvelope(crypto.encrypt('at-live-token'));
    expect(isSealedToken(sealed)).toBe(true);
    // These are all values a legacy clear row could hold.
    for (const clear of ['at-legacy', 'rt-1', '', 'v1', 'v1.only-two.parts', null, undefined, 42]) {
      expect(isSealedToken(clear)).toBe(false);
    }
  });

  it('rejects a tampered ciphertext rather than decrypting to garbage', () => {
    const sealed = encodeEnvelope(crypto.encrypt('at-live-token'));
    const [v, iv, authTag, ciphertext] = sealed.split('.');
    const flipped = (ciphertext[0] === 'A' ? 'B' : 'A') + ciphertext.slice(1);
    const tampered = [v, iv, authTag, flipped].join('.');

    expect(isSealedToken(tampered)).toBe(true);
    // GCM authenticates: a tampered payload must throw, never return a value
    // that looks like a token.
    expect(() => crypto.decrypt(decodeEnvelope(tampered))).toThrow();
  });

  it('rejects a malformed envelope', () => {
    expect(() => decodeEnvelope('v1.short')).toThrow(/Malformed/);
    expect(() => decodeEnvelope('v1.a..c')).toThrow(/empty/);
  });
});
