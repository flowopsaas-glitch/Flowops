import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CarbonService } from './carbon.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Carbon & ESG')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.VIEWER)
@Controller('carbon')
export class CarbonController {
  constructor(private readonly carbon: CarbonService) {}

  /**
   * GET /carbon/report — Fleet-wide carbon emissions report
   */
  @Get('report')
  @ApiOperation({ summary: 'Fleet carbon emissions report (ESG compliance)' })
  getReport(@CurrentUser() u: any, @Query('days') days?: string) {
    return this.carbon.getFleetReport(u.companyId, days ? +days : 30);
  }

  /**
   * GET /carbon/waybill/:id — Per-shipment carbon calculation
   */
  @Get('waybill/:id')
  @ApiOperation({ summary: 'Per-shipment CO2 calculation' })
  getWaybillCarbon(@CurrentUser() u: any, @Param('id') id: string) {
    return this.carbon.calculateWaybill(id, u.companyId);
  }

  /**
   * GET /carbon/estimate — Quick estimate without a real waybill
   */
  @Get('estimate')
  @ApiOperation({ summary: 'Quick CO2 estimate by distance + vehicle type' })
  estimate(
    @Query('distanceKm') distanceKm: string,
    @Query('vehicleType') vehicleType?: string,
    @Query('weightKg') weightKg?: string,
  ) {
    return this.carbon.calculateShipment(
      parseFloat(distanceKm) || 10,
      vehicleType,
      weightKg ? parseFloat(weightKg) : undefined,
    );
  }
}
