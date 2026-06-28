import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/**
 * AES-256-GCM encryption for per-tenant customs transmission secrets.
 *
 * The key comes from CUSTOMS_EDI_KEY (a 32-byte value, base64-encoded). It is
 * only required for secret-bearing paths (DIRECT_EDI / SERVICE_PROVIDER). When
 * the key is absent the service reports `isConfigured === false`, and the
 * credential service refuses to store secrets — so the CLEARING_AGENT_HANDOFF
 * path (which has no secret) still works without any key configured.
 */
@Injectable()
export class CustomsEdiCryptoService {
  private readonly logger = new Logger(CustomsEdiCryptoService.name);
  private readonly key: Buffer | null;

  constructor(private readonly config: ConfigService) {
    const raw = this.config.get<string>('CUSTOMS_EDI_KEY', '');
    let key: Buffer | null = null;
    if (raw) {
      try {
        const buf = Buffer.from(raw, 'base64');
        if (buf.length === 32) {
          key = buf;
        } else {
          this.logger.warn(
            'CUSTOMS_EDI_KEY must decode to exactly 32 bytes (base64). Secret-bearing customs paths are disabled.',
          );
        }
      } catch {
        this.logger.warn('CUSTOMS_EDI_KEY is not valid base64. Secret-bearing customs paths are disabled.');
      }
    }
    this.key = key;
  }

  get isConfigured(): boolean {
    return this.key !== null;
  }

  encrypt(plaintext: string): EncryptedSecret {
    if (!this.key) {
      throw new Error('CUSTOMS_EDI_KEY is not configured — cannot store customs secrets.');
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
      ciphertext: enc.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  decrypt(secret: EncryptedSecret): string {
    if (!this.key) {
      throw new Error('CUSTOMS_EDI_KEY is not configured — cannot read customs secrets.');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(secret.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(secret.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
