import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SubscriptionTiersService } from './subscription-tiers.service';

@Controller('subscriptions/tiers')
@UseGuards(JwtAuthGuard)
export class SubscriptionTiersController {
  constructor(private readonly tiers: SubscriptionTiersService) {}

  @Get()
  async getAllPlans() {
    return this.tiers.getAllPlans();
  }

  @Get('current')
  async getCurrentPlan(@Request() req: any) {
    const companyId = req.user.companyId;
    const company = await this.tiers['prisma'].company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return { error: 'Company not found' };
    }

    const features = this.tiers.getPlanFeatures(company.plan as any);
    return {
      currentPlan: company.plan,
      features,
    };
  }

  @Post('upgrade')
  async upgradePlan(
    @Request() req: any,
    @Body() body: { tier: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE' },
  ) {
    const companyId = req.user.companyId;
    return this.tiers.upgradeTier(companyId, body.tier);
  }

  @Get('check/:feature')
  async checkFeature(
    @Request() req: any,
    @Param('feature') feature: string,
  ) {
    const companyId = req.user.companyId;
    const hasAccess = await this.tiers.hasAIFeature(companyId, feature);
    return { feature, hasAccess };
  }
}
