import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FleetMapService } from './fleet-map.service';

@Controller('fleet-map')
@UseGuards(JwtAuthGuard)
export class FleetMapController {
  constructor(private readonly fleetMapService: FleetMapService) {}

  @Get('drivers')
  async getActiveDrivers(@Request() req: any, @Query('companyId') companyId?: string) {
    const user = req.user;
    const targetCompanyId = companyId ? parseInt(companyId) : user.companyId;
    return this.fleetMapService.getActiveDrivers(targetCompanyId);
  }

  @Get('drivers/:id/location')
  async getDriverLocation(@Query('id') id: string) {
    return this.fleetMapService.getDriverLocation(parseInt(id));
  }

  @Get('stats')
  async getFleetStats(@Request() req: any, @Query('companyId') companyId?: string) {
    const user = req.user;
    const targetCompanyId = companyId ? parseInt(companyId) : user.companyId;
    return this.fleetMapService.getFleetStats(targetCompanyId);
  }
}
