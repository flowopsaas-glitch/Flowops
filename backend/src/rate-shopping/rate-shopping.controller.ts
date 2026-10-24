import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RateShoppingService, RateRequest, CarrierConfig } from './rate-shopping.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
const RATE_SHOPPING_READ_ROLES = [
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
  UserRole.VIEWER,
];


@ApiTags('Rate Shopping')
@ApiBearerAuth()
@UseGuards(FeatureGuard)
@RequireFeature('rateShopping')
@Roles(...RATE_SHOPPING_READ_ROLES)
@Controller('rate-shopping')
export class RateShoppingController {
  constructor(private readonly svc: RateShoppingService) {}

  /**
   * POST /rate-shopping/compare
   * Body: { fromAddress, toAddress, weightKg, parcels?, carrierConfigs? }
   */
  @Post('compare')
  compare(
    @CurrentUser() u: any,
    @Body() body: Omit<RateRequest, 'companyId'> & { carrierConfigs?: Record<string, CarrierConfig> },
  ) {
    const { carrierConfigs, ...req } = body;
    return this.svc.compare({ ...req, companyId: u.companyId }, carrierConfigs);
  }

  /** GET /rate-shopping/carriers — list available carriers. */
  @Get('carriers')
  carriers() {
    return this.svc.carriers();
  }
}
