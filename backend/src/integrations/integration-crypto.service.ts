import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/**
 * AES-256-GCM encryption for per-tenant integration secrets (WhatsApp tokens,
 * Shopify/WooCommerce webhook secrets, etc.).
 *
 * Key resolution (first that decodes to 32 bytes wins):
 *   1. INTEGRATIONS_ENC_KEY   (base64, 32 bytes) — preferred, dedicated key
 *   2. CUSTOMS_EDI_KEY        (base64, 32 bytes) — reused if already set, so
 *                              installs that configured customs EDI work as-is
 *
 * When no valid key is configured, `isConfigured` is false and the credential
 * service refuses to store secrets (rather than persisting them in clear).
 */
@Injectable()
export class IntegrationCryptoService {
  private readonly logger = new Logger(IntegrationCryptoService.name);
  private readonly key: Buffer | null;

  constructor(private readonly config: ConfigService) {
    this.key =
      this.loadKey('INTEGRATIONS_ENC_KEY') ?? this.loadKey('CUSTOMS_EDI_KEY');
    if (!this.key) {
      this.logger.warn(
        'No INTEGRATIONS_ENC_KEY (or CUSTOMS_EDI_KEY) configured — storing integration secrets is disabled until a 32-byte base64 key is set.',
      );
    }
  }

  private loadKey(envName: string): Buffer | null {
    const raw = this.config.get<string>(envName, '');
    if (!raw) return null;
    try {
      const buf = Buffer.from(raw, 'base64');
      if (buf.length === 32) return buf;
      this.logger.warn(`${envName} must decode to exactly 32 bytes (base64).`);
    } catch {
      this.logger.warn(`${envName} is not valid base64.`);
    }
    return null;
  }

  get isConfigured(): boolean {
    return this.key !== null;
  }

  encrypt(plaintext: string): EncryptedSecret {
    if (!this.key) {
      throw new Error('Integration encryption key is not configured — cannot store secrets.');
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
      throw new Error('Integration encryption key is not configured — cannot read secrets.');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(secret.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(secret.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
