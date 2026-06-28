import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CustomsEdiCryptoService } from './crypto.service';
import { CustomsEdiTransportFactory } from './customs-edi-transport.factory';
import { DecryptedCredential } from './customs-edi-transport';

const VALID_PATHS = ['DIRECT_EDI', 'SERVICE_PROVIDER', 'CLEARING_AGENT_HANDOFF'];

export interface UpsertCustomsEdiCredentialInput {
  path: string;
  customsClientCode?: string;
  providerName?: string;
  endpointUrl?: string;
  agentEmail?: string;
  /** Plaintext API key / token — encrypted at rest, never returned. */
  secret?: string;
}

/**
 * Per-tenant customs transmission credentials. Secrets are AES-256-GCM encrypted
 * and are NEVER returned to any client (masked on read). Strictly scoped to the
 * caller's companyId.
 */
@Injectable()
export class CustomsEdiCredentialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CustomsEdiCryptoService,
    private readonly transports: CustomsEdiTransportFactory,
    private readonly audit: AuditService,
  ) {}

  /** Client-safe view: never includes secret material. */
  async getMasked(companyId: string) {
    const c = await (this.prisma as any).customsEdiCredential.findUnique({ where: { companyId } });
    if (!c) return null;
    return {
      path: c.path,
      status: c.status,
      customsClientCode: c.customsClientCode,
      providerName: c.providerName,
      endpointUrl: c.endpointUrl,
      agentEmail: c.agentEmail,
      hasSecret: Boolean(c.secretCiphertext),
      secretMasked: c.secretCiphertext ? '••••••••' : null,
      lastVerifiedAt: c.lastVerifiedAt,
      updatedAt: c.updatedAt,
    };
  }

  async upsert(companyId: string, actorId: string | null, dto: UpsertCustomsEdiCredentialInput) {
    if (!dto?.path || !VALID_PATHS.includes(dto.path)) {
      throw new BadRequestException(`path must be one of: ${VALID_PATHS.join(', ')}`);
    }
    if (dto.path === 'CLEARING_AGENT_HANDOFF' && !dto.agentEmail) {
      throw new BadRequestException('agentEmail is required for the clearing-agent path.');
    }

    const data: any = {
      path: dto.path,
      status: 'UNVERIFIED',
      customsClientCode: dto.customsClientCode ?? null,
      providerName: dto.providerName ?? null,
      endpointUrl: dto.endpointUrl ?? null,
      agentEmail: dto.agentEmail ?? null,
    };

    if (dto.secret) {
      if (!this.crypto.isConfigured) {
        throw new BadRequestException(
          'CUSTOMS_EDI_KEY is not configured on the server, so secrets cannot be stored. Use the clearing-agent path, or ask ops to set the key.',
        );
      }
      const enc = this.crypto.encrypt(dto.secret);
      data.secretCiphertext = enc.ciphertext;
      data.secretIv = enc.iv;
      data.secretAuthTag = enc.authTag;
    }

    const saved = await (this.prisma as any).customsEdiCredential.upsert({
      where: { companyId },
      update: data,
      create: { ...data, companyId, createdBy: actorId ?? undefined },
    });

    await this.audit.record({
      action: 'customs.edi.credential.upsert',
      actorType: 'tenant',
      actorId,
      targetType: 'CustomsEdiCredential',
      targetId: saved.id,
      metadata: { path: saved.path, hasSecret: Boolean(saved.secretCiphertext) },
    });

    return this.getMasked(companyId);
  }

  /** Internal only — returns decrypted secret. Never expose via an API. */
  async decryptFor(companyId: string): Promise<DecryptedCredential | null> {
    const c = await (this.prisma as any).customsEdiCredential.findUnique({ where: { companyId } });
    if (!c) return null;

    let secret: string | null = null;
    if (c.secretCiphertext && c.secretIv && c.secretAuthTag) {
      secret = this.crypto.decrypt({ ciphertext: c.secretCiphertext, iv: c.secretIv, authTag: c.secretAuthTag });
    }

    return {
      companyId,
      path: c.path,
      customsClientCode: c.customsClientCode,
      providerName: c.providerName,
      endpointUrl: c.endpointUrl,
      agentEmail: c.agentEmail,
      secret,
    };
  }

  /** Non-mutating connection test. Stamps status + lastVerifiedAt. */
  async verify(companyId: string, actorId: string | null) {
    const cred = await this.decryptFor(companyId);
    if (!cred) {
      throw new BadRequestException('No customs transmission method is configured.');
    }
    const transport = this.transports.forPath(cred.path);
    const res = await transport.verify(cred);

    await (this.prisma as any).customsEdiCredential.update({
      where: { companyId },
      data: { status: res.ok ? 'VERIFIED' : 'UNVERIFIED', lastVerifiedAt: new Date() },
    });

    await this.audit.record({
      action: 'customs.edi.credential.verify',
      actorType: 'tenant',
      actorId,
      targetType: 'CustomsEdiCredential',
      targetId: companyId,
      metadata: { path: cred.path, ok: res.ok },
    });

    return { ok: res.ok, reason: res.reason ?? null };
  }
}
