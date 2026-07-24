import { Controller, Get, Post, Delete, Body, Param, Query, Patch, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { FleetMaintenanceService } from './fleet-maintenance.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Fleet Maintenance')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
@Controller('fleet-maintenance')
export class FleetMaintenanceController {
  constructor(private readonly svc: FleetMaintenanceService) {}

  @Get('health')
  @ApiOperation({ summary: 'Fleet health dashboard — all vehicles with status (OK/DUE_SOON/OVERDUE/CRITICAL)' })
  getHealth(@CurrentUser() u: any) {
    return this.svc.getFleetHealth(u.companyId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Service history (all vehicles or specific driver)' })
  getHistory(@CurrentUser() u: any, @Query('driverId') driverId?: string) {
    return this.svc.getServiceHistory(u.companyId, driverId);
  }

  @Post('log')
  @ApiOperation({ summary: 'Log a service event (oil change, tyres, annual service, etc.)' })
  logService(@CurrentUser() u: any, @Body() dto: any) {
    return this.svc.logService(u.companyId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a service record' })
  deleteService(@CurrentUser() u: any, @Param('id') id: string) {
    return this.svc.deleteService(u.companyId, id);
  }

  @Patch('odometer/:driverId')
  @ApiOperation({ summary: 'Update vehicle odometer reading' })
  updateOdometer(@CurrentUser() u: any, @Param('driverId') driverId: string, @Body() body: { km: number }) {
    return this.svc.updateOdometer(u.companyId, driverId, body?.km);
  }

  @Get('predictions')
  @ApiOperation({ summary: 'AI predictive maintenance — run analysis for all vehicles' })
  getPredictions(@CurrentUser() u: any) {
    return this.svc.runPredictiveAnalysis(u.companyId);
  }

  @Get('ai-advice/:driverId')
  @ApiOperation({ summary: 'AI deep maintenance advice for a specific vehicle (Groq-powered)' })
  getAiAdvice(@CurrentUser() u: any, @Param('driverId') driverId: string) {
    return this.svc.getAiMaintenanceAdvice(u.companyId, driverId);
  }

  @Get('costs')
  @ApiOperation({ summary: 'Maintenance cost analytics (this month, last month, by type, by driver)' })
  getCosts(@CurrentUser() u: any) {
    return this.svc.getCostAnalytics(u.companyId);
  }
}
