import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EpodService } from './epod.service';
import { CaptureEpodDto, VerifyEpodDto, DisputeEpodDto } from './dto/epod.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
const EPOD_READ_ROLES = [
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
  UserRole.DISPATCH, UserRole.WAREHOUSE, UserRole.AGENT,
  UserRole.USER,
];


@ApiTags('Electronic POD')
@ApiBearerAuth()
@UseGuards(FeatureGuard)
@RequireFeature('epod')
@Roles(...EPOD_READ_ROLES)
@Controller('epod')
export class EpodController {
  constructor(private readonly svc: EpodService) {}

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Post('capture')
  capture(@CurrentUser() u: any, @Body() dto: CaptureEpodDto) {
    return this.svc.capture(u.companyId, dto, { userId: u.id ?? u.sub, role: u.role });
  }

  @Get()
  findAll(@CurrentUser() u: any, @Query() query: any) {
    return this.svc.findAll(u.companyId, query);
  }

  @Get('stats')
  getStats(@CurrentUser() u: any) {
    return this.svc.getStats(u.companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.findOne(id, u.companyId);
  }

  @Get('waybill/:waybillId')
  findByWaybill(@Param('waybillId') waybillId: string, @CurrentUser() u: any) {
    return this.svc.findByWaybill(waybillId, u.companyId);
  }

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Post(':id/verify')
  verify(@Param('id') id: string, @CurrentUser() u: any, @Body() dto: VerifyEpodDto) {
    return this.svc.verify(id, u.companyId, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Post(':id/resolve-dispute')
  resolveDispute(
    @Param('id') id: string,
    @Body() body: { resolution: 'CLEARED' | 'UPHELD'; resolvedBy: string; note?: string },
    @CurrentUser() u: any,
  ) {
    return this.svc.resolveDispute(id, u.companyId, body);
  }

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Post(':id/dispute')
  dispute(@Param('id') id: string, @CurrentUser() u: any, @Body() dto: DisputeEpodDto) {
    return this.svc.dispute(id, u.companyId, dto);
  }
}
