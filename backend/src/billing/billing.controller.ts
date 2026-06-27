import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
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
}
