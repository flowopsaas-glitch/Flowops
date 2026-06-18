import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RateShoppingService, RateRequest, CarrierConfig } from './rate-shopping.service';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('Rate Shopping')
@ApiBearerAuth()
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
