import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import { RateShoppingService, CompareRequest } from './rate-shopping.service';

@ApiTags('Rate Shopping')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('rate-shopping')
export class RateShoppingController {
  constructor(private readonly svc: RateShoppingService) {}

  /** List all SA provinces (for from/to dropdowns). */
  @Get('provinces')
  provinces() {
    return this.svc.listProvinces();
  }

  /** Tenant carrier configurations. */
  @Get('carriers')
  carriers(@CurrentUser() user: any) {
    return this.svc.listCarriers(user.companyId);
  }

  /** Enable/disable or set markup on a carrier. */
  @Post('carriers/:carrierId')
  upsertCarrier(
    @Param('carrierId') carrierId: string,
    @Body() body: { isEnabled?: boolean; markupPct?: number },
    @CurrentUser() user: any,
  ) {
    return this.svc.upsertCarrier(user.companyId, carrierId, body);
  }

  /**
   * Compare rates for a parcel across all enabled carriers.
   *
   * Body: { weight, fromProvince, toProvince, parcels?, carriersFilter? }
   */
  @Post('compare')
  compare(@Body() body: CompareRequest, @CurrentUser() user: any) {
    return this.svc.compareRates(user.companyId, body);
  }
}
