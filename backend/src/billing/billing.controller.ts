import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Plan, effective plan (trial-aware), feature flags, limits + live usage. */
  @Get('entitlements')
  entitlements(@CurrentUser() u: any) {
    return this.billing.getEntitlements(u.companyId);
  }

  /** Request an upgrade to a higher tier — owner-approved, no payment. */
  @Post('upgrade-requests')
  @ApiOperation({ summary: 'Request a plan upgrade (owner approves in-app)' })
  createUpgradeRequest(
    @CurrentUser() u: any,
    @Body() body: { requestedPlan: string; note?: string },
  ) {
    return this.billing.createUpgradeRequest(
      u.companyId,
      { id: u.sub ?? u.id, email: u.email },
      body?.requestedPlan,
      body?.note,
    );
  }

  /** The tenant's own upgrade requests + statuses. */
  @Get('upgrade-requests')
  myUpgradeRequests(@CurrentUser() u: any) {
    return this.billing.listMyUpgradeRequests(u.companyId);
  }
}
