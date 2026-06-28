import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CourierManagementService } from './courier-management.service';
import { ApplyPlanDto, CreateCourierOrderDto, UpdateCourierOrderDto } from './dto/courier-order.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

/**
 * Courier Management Suite — client orders + AI delivery orchestration.
 * Enterprise plan gate is enforced in the service (courierManagement feature).
 */
@ApiTags('Courier Management')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
@Controller('couriers')
export class CourierManagementController {
  constructor(private readonly svc: CourierManagementService) {}

  @Post('orders')
  createOrder(@CurrentUser() u: any, @Body() dto: CreateCourierOrderDto) {
    return this.svc.createOrder(u.companyId, dto);
  }

  @Get('orders')
  listOrders(@CurrentUser() u: any, @Query('status') status?: string) {
    return this.svc.listOrders(u.companyId, status);
  }

  @Get('stats')
  stats(@CurrentUser() u: any) {
    return this.svc.stats(u.companyId);
  }

  @Patch('orders/:id')
  updateOrder(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: UpdateCourierOrderDto) {
    return this.svc.updateOrder(u.companyId, id, dto);
  }

  /** AI delivery orchestration — returns a recommended assignment plan (does not persist). */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('orchestrate')
  @ApiOperation({ summary: 'AI-assign pending orders across available drivers' })
  orchestrate(@CurrentUser() u: any) {
    return this.svc.orchestrate(u.companyId);
  }

  /** Apply an orchestration plan (dispatcher confirms). */
  @Post('orchestrate/apply')
  applyPlan(@CurrentUser() u: any, @Body() dto: ApplyPlanDto) {
    return this.svc.applyPlan(u.companyId, dto);
  }
}
