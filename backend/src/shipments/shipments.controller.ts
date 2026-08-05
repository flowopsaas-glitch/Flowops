import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ShipmentsService } from './shipments.service';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('Shipments')
@ApiBearerAuth()
@Controller()
export class ShipmentsController {
  constructor(private readonly svc: ShipmentsService) {}

  @Get('shipments')
  findAll(@CurrentUser() u: any, @Query() q: any) {
    return this.svc.findAll(u.companyId, q);
  }

  @Get('shipments/live')
  findLive(@CurrentUser() u: any) {
    return this.svc.findLive(u.companyId);
  }

  @Get('shipments/health')
  health(@CurrentUser() u: any) {
    return this.svc.health(u.companyId);
  }

  @Post('shipments')
  create(@CurrentUser() u: any, @Body() body: any) {
    return this.svc.create(u.companyId, body);
  }

  @Get('shipments/:id')
  findOne(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.findOne(id, u.companyId);
  }

  @Patch('shipments/:id')
  update(@Param('id') id: string, @CurrentUser() u: any, @Body() body: any) {
    return this.svc.update(id, u.companyId, body);
  }

  @Get('shipments-risk/:id')
  getRisk(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.getRisk(id, u.companyId);
  }

  @Post('shipments-risk/recalculate')
  recalculateRisk(@CurrentUser() u: any, @Body() body: any) {
    return this.svc.recalculateRisk(u.companyId, body);
  }
}
