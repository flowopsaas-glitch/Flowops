import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RouteOptimizationService } from './route-optimization.service';
import { CreateRouteOptimizationDto } from './dto/route-optimization.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';

@ApiTags('Route Optimization')
@ApiBearerAuth()
@UseGuards(FeatureGuard)
@RequireFeature('routeOptimization')
@Controller('route-optimization')
export class RouteOptimizationController {
  constructor(private readonly svc: RouteOptimizationService) {}

  @Post()
  create(@CurrentUser() u: any, @Body() dto: CreateRouteOptimizationDto) {
    return this.svc.create(u.companyId, dto);
  }

  @Get()
  findAll(@CurrentUser() u: any) {
    return this.svc.findAll(u.companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.findOne(id, u.companyId);
  }

  @Get(':id/insights')
  getInsights(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.getInsights(id, u.companyId);
  }
}
