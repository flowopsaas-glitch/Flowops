import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OrderFlowService } from './order-flow.service';
import { CreateIntegrationDto, UpdateIntegrationDto, IngestOrderDto } from './dto/order-flow.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';

@ApiTags('Order Flow Integrations')
@ApiBearerAuth()
@UseGuards(FeatureGuard)
@RequireFeature('orderFlowIntegration')
@Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
@Controller('order-flow')
export class OrderFlowController {
  constructor(private readonly svc: OrderFlowService) {}

  @Post('integrations')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  create(@CurrentUser() u: any, @Body() dto: CreateIntegrationDto) {
    return this.svc.createIntegration(u.companyId, dto);
  }

  @Get('integrations')
  list(@CurrentUser() u: any) {
    return this.svc.listIntegrations(u.companyId);
  }

  @Get('integrations/:id')
  getOne(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.getIntegration(id, u.companyId);
  }

  @Patch('integrations/:id')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  update(@Param('id') id: string, @CurrentUser() u: any, @Body() dto: UpdateIntegrationDto) {
    return this.svc.updateIntegration(id, u.companyId, dto);
  }

  @Post('integrations/:id/activate')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  activate(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.activateIntegration(id, u.companyId);
  }

  @Post('integrations/:id/deactivate')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  deactivate(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.deactivateIntegration(id, u.companyId);
  }

  @Delete('integrations/:id')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  remove(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.deleteIntegration(id, u.companyId);
  }

  @Post('ingest')
  ingest(@CurrentUser() u: any, @Body() dto: IngestOrderDto) {
    return this.svc.ingestOrder(u.companyId, dto);
  }

  @Get('integrations/:id/logs')
  logs(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.getSyncLogs(id, u.companyId);
  }
}
