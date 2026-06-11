import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Guard against routes called without JWT Auth first
    if (!user || !user.companyId) {
      return false;
    }

    const company = await this.prisma.company.findUnique({
      where: { id: user.companyId },
    });

    if (!company) {
      throw new ForbiddenException('Company profile not found.');
    }

    const now = new Date();

    // 1. Check for Starter Plan Trial Expiry
    // We use type casting (any) as a backup if your IDE hasn't refreshed prisma yet
    const companyData = company as any; 

    if (companyData.plan === 'Starter' && companyData.status === 'Trialing') {
      if (companyData.trialEndsAt && now > companyData.trialEndsAt) {
        // Auto-lock the account
        await this.prisma.company.update({
          where: { id: company.id },
          data: { status: 'Locked' },
        });
        throw new ForbiddenException('Your 14-day FlowOps trial has expired. Please upgrade to continue.');
      }
    }

    // 2. Check if the account is Locked
    if (companyData.status === 'Locked') {
      throw new ForbiddenException('Access Denied: Your account is locked. Please contact support or check billing.');
    }

    return true;
  }
}
