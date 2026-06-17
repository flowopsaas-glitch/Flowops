import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeysService {
  constructor(private prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.apiKey.findMany({
      where: { companyId },
      select: { id: true, name: true, prefix: true, lastUsedAt: true, revokedAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Generates a key; the plaintext is returned ONCE and never stored. */
  async create(companyId: string, name: string) {
    const token = `fok_live_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(token).digest('hex');
    const prefix = token.slice(0, 16);
    const record = await this.prisma.apiKey.create({
      data: { companyId, name: name || 'Default key', keyHash, prefix },
    });
    return { id: record.id, name: record.name, prefix, key: token };
  }

  async revoke(id: string, companyId: string) {
    const key = await this.prisma.apiKey.findFirst({ where: { id, companyId } });
    if (!key) throw new NotFoundException('API key not found');
    await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    return { revoked: true };
  }
}
