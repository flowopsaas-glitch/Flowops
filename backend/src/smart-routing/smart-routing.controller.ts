import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SmartRoutingService } from './smart-routing.service';
import { CreateRoutePlanDto, UpdateRoutePlanDto } from './dto/smart-routing.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Smart Routing')
@ApiBearerAuth()
@UseGuards(FeatureGuard)
@RequireFeature('smartRouting')
@Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
@Controller('smart-routing')
export class SmartRoutingController {
  constructor(private readonly svc: SmartRoutingService) {}

  @Post('plans')
  create(@CurrentUser() u: any, @Body() dto: CreateRoutePlanDto) {
    return this.svc.createPlan(u.companyId, dto);
  }

  @Get('plans')
  findAll(@CurrentUser() u: any, @Query() query: any) {
    return this.svc.findAll(u.companyId, query);
  }

  @Get('plans/:id')
  findOne(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.findOne(id, u.companyId);
  }

  @Patch('plans/:id')
  update(@Param('id') id: string, @CurrentUser() u: any, @Body() dto: UpdateRoutePlanDto) {
    return this.svc.update(id, u.companyId, dto);
  }

  @Post('plans/:id/activate')
  activate(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.activatePlan(id, u.companyId);
  }

  @Post('plans/:id/complete')
  complete(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.completePlan(id, u.companyId);
  }

  @Post('plans/:id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.cancelPlan(id, u.companyId);
  }

  @Get('schedule')
  getSchedule(@CurrentUser() u: any, @Query('date') date: string) {
    return this.svc.getSchedule(u.companyId, date || new Date().toISOString());
  }
}
