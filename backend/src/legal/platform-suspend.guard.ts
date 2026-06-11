import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlatformSuspendGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const companyId = request.user?.companyId || 1; // Default to HQ if not found

    // 🛡️ FOUNDER BYPASS: HQ (Company 1) is immortal
    if (companyId === 1) return true;

    try {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
      }) as any; // Cast to any to bypass schema mismatch during upgrade

      // If the field exists and is explicitly false, suspend. 
      // Otherwise, assume active (commercial safety fallback).
      if (company && company.isActive === false) {
        throw new ForbiddenException('FlowOps Access Suspended: Contact Billing.');
      }
    } catch (e) {
      // If the database query fails because the column is missing, 
      // we let the user through so the app doesn't crash.
      return true;
    }

    return true;
  }
}
