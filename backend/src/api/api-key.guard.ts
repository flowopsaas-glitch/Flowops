import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

/**
 * Authenticates public-API requests via the `X-API-Key` header. The plaintext
 * key is never stored — we hash and look up. On success the resolved tenant is
 * attached to the request as `apiCompanyId`.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const raw = (req.headers['x-api-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '')) as string;
    if (!raw) throw new UnauthorizedException('Missing API key');

    const keyHash = crypto.createHash('sha256').update(raw).digest('hex');
    const key = await this.prisma.apiKey.findUnique({ where: { keyHash } });
    if (!key || key.revokedAt) throw new UnauthorizedException('Invalid or revoked API key');

    // Best-effort last-used stamp.
    this.prisma.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    req.apiCompanyId = key.companyId;
    return true;
  }
}
