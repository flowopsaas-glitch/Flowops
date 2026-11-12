import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ShipmentsService } from './shipments.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CreateShipmentDto, RecalculateRiskDto, UpdateShipmentDto } from './dto/shipment.dto';
const SHIPMENT_READ_ROLES = [
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
  UserRole.DISPATCH, UserRole.WAREHOUSE, UserRole.AGENT,
  UserRole.USER,
];


@ApiTags('Shipments')
@ApiBearerAuth()
@Roles(...SHIPMENT_READ_ROLES)
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

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.AGENT,
  )
  @Post('shipments')
  create(@CurrentUser() u: any, @Body() body: CreateShipmentDto) {
    return this.svc.create(u.companyId, body);
  }

  @Get('shipments/:id')
  findOne(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.findOne(id, u.companyId);
  }

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.AGENT,
  )
  @Patch('shipments/:id')
  update(@Param('id') id: string, @CurrentUser() u: any, @Body() body: UpdateShipmentDto) {
    return this.svc.update(id, u.companyId, body);
  }

  @Get('shipments-risk/:id')
  getRisk(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.getRisk(id, u.companyId);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Post('shipments-risk/recalculate')
  recalculateRisk(@CurrentUser() u: any, @Body() body: RecalculateRiskDto) {
    return this.svc.recalculateRisk(u.companyId, body);
  }
}
