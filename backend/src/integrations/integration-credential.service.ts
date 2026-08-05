import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationCryptoService } from './integration-crypto.service';

export type ProviderId = 'whatsapp' | 'shopify' | 'woocommerce';
export type IntegrationFeature = 'whatsapp' | 'ecommerce';

interface ProviderSpec {
  feature: IntegrationFeature;
  /** Non-secret fields, returned to clients as-is. */
  configFields: string[];
  /** Secret fields — encrypted at rest, never returned (only a `has*` flag). */
  secretFields: string[];
  /** Which config field is the inbound-routing key (externalRef). */
  externalRefField?: string;
  /** Fields that must be present (config or secret) the first time it's saved. */
  required: string[];
}

export const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  whatsapp: {
    feature: 'whatsapp',
    // gateway = 'meta' (WhatsApp Business Cloud API) | 'telesign' (Telesign omnichannel)
    configFields: [
      'gateway',
      'phoneNumberId',
      'businessAccountId',
      'apiVersion',
      'telesignCustomerId',
      'telesignSenderId',
      'telesignTemplate',
    ],
    secretFields: ['accessToken', 'webhookVerifyToken', 'appSecret', 'telesignApiKey'],
    externalRefField: 'phoneNumberId', // Meta inbound routing key
    required: [], // gateway-specific — validated in requiredFor()
  },
  shopify: {
    feature: 'ecommerce',
    configFields: ['shopDomain'],
    secretFields: ['webhookSecret', 'accessToken'],
    externalRefField: 'shopDomain',
    required: ['shopDomain', 'webhookSecret'],
  },
  woocommerce: {
    feature: 'ecommerce',
    configFields: ['sourceUrl'],
    secretFields: ['webhookSecret'],
    externalRefField: 'sourceUrl',
    required: ['sourceUrl', 'webhookSecret'],
  },
};

export interface DecryptedCredential {
  companyId: string;
  provider: ProviderId;
  config: Record<string, string>;
  secrets: Record<string, string>;
  status: string;
}

/** Normalise the routing key so webhook lookups match what was saved. */
function normaliseRef(provider: ProviderId, value: string): string {
  const v = (value || '').trim().toLowerCase();
  if (provider === 'woocommerce') return v.replace(/\/+$/, ''); // drop trailing slash
  return v;
}

/**
 * Per-tenant integration credentials. Secrets are AES-256-GCM encrypted and are
 * NEVER returned to any client (masked on read). All reads/writes are scoped to
 * the caller's companyId; the only cross-tenant path is the internal
 * `resolveCompanyByRef`, used by inbound webhook handlers to find the owner.
 */
@Injectable()
export class IntegrationCredentialService {
  private readonly logger = new Logger(IntegrationCredentialService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: IntegrationCryptoService,
  ) {}

  get encryptionReady(): boolean {
    return this.crypto.isConfigured;
  }

  private spec(provider: string): ProviderSpec {
    const s = (PROVIDERS as Record<string, ProviderSpec>)[provider];
    if (!s) throw new BadRequestException(`Unknown integration provider: ${provider}`);
    return s;
  }

  featureFor(provider: string): IntegrationFeature {
    return this.spec(provider).feature;
  }

  /** Required fields, gateway-aware for WhatsApp (Meta vs Telesign). */
  private requiredFor(provider: string, merged: Record<string, string>): string[] {
    if (provider === 'whatsapp') {
      return merged.gateway === 'telesign'
        ? ['telesignCustomerId', 'telesignApiKey']
        : ['phoneNumberId', 'accessToken'];
    }
    return this.spec(provider).required;
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  /** Client-safe view of one provider (no secret material). */
  async getMasked(companyId: string, provider: ProviderId) {
    const spec = this.spec(provider);
    const row = await (this.prisma as any).integrationCredential.findUnique({
      where: { companyId_provider: { companyId, provider } },
    });
    const config = (row?.config ?? {}) as Record<string, string>;
    const present = await this.decryptSecretFields(row);

    return {
      provider,
      feature: spec.feature,
      connected: Boolean(row),
      status: row?.status ?? 'NOT_CONNECTED',
      config: Object.fromEntries(spec.configFields.map((f) => [f, config[f] ?? null])),
      secretsSet: Object.fromEntries(
        spec.secretFields.map((f) => [f, Boolean(present[f])]),
      ),
      lastVerifiedAt: row?.lastVerifiedAt ?? null,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  /** Masked view of every provider for a tenant. */
  async list(companyId: string) {
    const providers = Object.keys(PROVIDERS) as ProviderId[];
    return Promise.all(providers.map((p) => this.getMasked(companyId, p)));
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  /**
   * Create/update a provider connection. Config fields overwrite; secret fields
   * are merged (omitted/blank secrets keep the stored value) so you can edit a
   * domain without re-typing the token.
   */
  async upsert(
    companyId: string,
    actorId: string | null,
    provider: ProviderId,
    values: Record<string, any>,
  ) {
    const spec = this.spec(provider);
    const existing = await (this.prisma as any).integrationCredential.findUnique({
      where: { companyId_provider: { companyId, provider } },
    });

    // ── config (non-secret) ──
    const prevConfig = (existing?.config ?? {}) as Record<string, string>;
    const config: Record<string, string> = { ...prevConfig };
    for (const f of spec.configFields) {
      const v = values[f];
      if (v !== undefined && v !== null) config[f] = String(v).trim();
    }

    // ── secrets (merge with existing) ──
    const prevSecrets = await this.decryptSecretFields(existing);
    const secrets: Record<string, string> = { ...prevSecrets };
    let secretsTouched = false;
    for (const f of spec.secretFields) {
      const v = values[f];
      if (v !== undefined && v !== null && String(v).length > 0) {
        secrets[f] = String(v).trim();
        secretsTouched = true;
      }
    }

    // ── required-field validation (first save) ──
    for (const f of this.requiredFor(provider, { ...config, ...secrets })) {
      const has = config[f] || secrets[f];
      if (!has) throw new BadRequestException(`'${f}' is required to connect ${provider}.`);
    }

    const data: any = {
      provider,
      config,
      status: 'UNVERIFIED',
    };

    if (spec.externalRefField) {
      const refSource = config[spec.externalRefField];
      data.externalRef = refSource ? normaliseRef(provider, refSource) : null;
    }

    if (secretsTouched || (!existing && Object.keys(secrets).length)) {
      if (!this.crypto.isConfigured) {
        throw new BadRequestException(
          'The server has no integration encryption key configured (INTEGRATIONS_ENC_KEY), so secrets cannot be stored. Ask your operator to set a 32-byte base64 key.',
        );
      }
      const enc = this.crypto.encrypt(JSON.stringify(secrets));
      data.secretCiphertext = enc.ciphertext;
      data.secretIv = enc.iv;
      data.secretAuthTag = enc.authTag;
    }

    await (this.prisma as any).integrationCredential.upsert({
      where: { companyId_provider: { companyId, provider } },
      update: data,
      create: { ...data, companyId, createdBy: actorId ?? undefined },
    });

    this.logger.log(`Integration '${provider}' saved for company ${companyId}`);
    return this.getMasked(companyId, provider);
  }

  async remove(companyId: string, provider: ProviderId) {
    await (this.prisma as any).integrationCredential
      .delete({ where: { companyId_provider: { companyId, provider } } })
      .catch(() => undefined);
    return { provider, connected: false };
  }

  async setStatus(companyId: string, provider: ProviderId, status: string) {
    await (this.prisma as any).integrationCredential.updateMany({
      where: { companyId, provider },
      data: { status, lastVerifiedAt: new Date() },
    });
  }

  // ── Internal: used by webhook handlers / outbound senders ──────────────────

  /** Full decrypted credential for a tenant+provider. Never expose via API. */
  async getDecrypted(companyId: string, provider: ProviderId): Promise<DecryptedCredential | null> {
    const row = await (this.prisma as any).integrationCredential.findUnique({
      where: { companyId_provider: { companyId, provider } },
    });
    if (!row) return null;
    return {
      companyId,
      provider,
      config: (row.config ?? {}) as Record<string, string>,
      secrets: await this.decryptSecretFields(row),
      status: row.status,
    };
  }

  /** Resolve the owning company for an inbound webhook by its routing key. */
  async resolveCompanyByRef(provider: ProviderId, ref: string): Promise<string | null> {
    if (!ref) return null;
    const row = await (this.prisma as any).integrationCredential.findFirst({
      where: { provider, externalRef: normaliseRef(provider, ref) },
      select: { companyId: true },
    });
    return row?.companyId ?? null;
  }

  /** WhatsApp webhook verification: find a tenant whose verify token matches. */
  async findWhatsAppByVerifyToken(token: string): Promise<string | null> {
    if (!token) return null;
    const rows = await (this.prisma as any).integrationCredential.findMany({
      where: { provider: 'whatsapp' },
    });
    for (const row of rows) {
      const secrets = await this.decryptSecretFields(row);
      if (secrets.webhookVerifyToken && secrets.webhookVerifyToken === token) {
        return row.companyId;
      }
    }
    return null;
  }

  /** True if any tenant has configured this provider (controls env fallback). */
  async anyConfigured(provider: ProviderId): Promise<boolean> {
    const n = await (this.prisma as any).integrationCredential.count({ where: { provider } });
    return n > 0;
  }

  private async decryptSecretFields(row: any): Promise<Record<string, string>> {
    if (!row?.secretCiphertext || !row?.secretIv || !row?.secretAuthTag) return {};
    try {
      const json = this.crypto.decrypt({
        ciphertext: row.secretCiphertext,
        iv: row.secretIv,
        authTag: row.secretAuthTag,
      });
      const parsed = JSON.parse(json);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      this.logger.error(`Failed to decrypt secrets for credential ${row.id}: ${(err as Error).message}`);
      return {};
    }
  }
}
