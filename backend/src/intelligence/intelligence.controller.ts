import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PredictiveDeliveryService } from './predictive-delivery.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';

@ApiTags('Delivery Intelligence')
@ApiBearerAuth()
@Controller('intelligence')
export class IntelligenceController {
  constructor(private readonly engine: PredictiveDeliveryService) {}

  @Post('predict')
  @ApiOperation({ summary: 'Predict delivery success probability before dispatch' })
  predict(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: {
      recipientAddress: string;
      recipientPhone?: string;
      recipientLat?: number;
      recipientLng?: number;
      driverId?: string;
      timeSlot?: string;
      isCod?: boolean;
    },
  ) {
    return this.engine.predictDelivery(u.companyId, body);
  }

  @Post('predict-manifest')
  @ApiOperation({ summary: 'Batch predict entire manifest — score all waybills before dispatch' })
  predictManifest(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: { waybillIds: string[] },
  ) {
    return this.engine.predictManifest(u.companyId, body.waybillIds);
  }

  @Get('address/:address')
  @ApiOperation({ summary: 'Get address intelligence — historical success, risk factors, best times' })
  addressIntel(
    @CurrentUser() u: AuthenticatedUser,
    @Param('address') address: string,
  ) {
    const zone = address; // The service handles zone extraction
    return this.engine.getAddressIntelligence(u.companyId, address, zone);
  }

  @Get('driver/:driverId/zone/:zone')
  @ApiOperation({ summary: 'Get driver performance score for a specific zone/suburb' })
  driverZoneScore(
    @CurrentUser() u: AuthenticatedUser,
    @Param('driverId') driverId: string,
    @Param('zone') zone: string,
  ) {
    return this.engine.getDriverAreaScore(u.companyId, driverId, zone);
  }

  @Get('best-drivers/:zone')
  @ApiOperation({ summary: 'Get top drivers ranked by success rate for a zone' })
  bestDrivers(
    @CurrentUser() u: AuthenticatedUser,
    @Param('zone') zone: string,
    @Query('limit') limit?: string,
  ) {
    return this.engine.getBestDriversForZone(u.companyId, zone, Number(limit) || 5);
  }

  @Get('time-windows/:zone')
  @ApiOperation({ summary: 'Get delivery success rate by time window for a zone' })
  timeWindows(
    @CurrentUser() u: AuthenticatedUser,
    @Param('zone') zone: string,
  ) {
    return this.engine.getAllTimeWindows(u.companyId, zone);
  }

  @Get('heatmap')
  @ApiOperation({ summary: 'Zone delivery heatmap — success/failure rates across all areas' })
  heatmap(@CurrentUser() u: AuthenticatedUser) {
    return this.engine.getZoneHeatmap(u.companyId);
  }
}
