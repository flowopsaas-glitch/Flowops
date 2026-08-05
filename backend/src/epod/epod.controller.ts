import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EpodService } from './epod.service';
import { CaptureEpodDto, VerifyEpodDto, DisputeEpodDto } from './dto/epod.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';

@ApiTags('Electronic POD')
@ApiBearerAuth()
@UseGuards(FeatureGuard)
@RequireFeature('epod')
@Controller('epod')
export class EpodController {
  constructor(private readonly svc: EpodService) {}

  @Post('capture')
  capture(@CurrentUser() u: any, @Body() dto: CaptureEpodDto) {
    return this.svc.capture(u.companyId, dto);
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

  @Post(':id/verify')
  verify(@Param('id') id: string, @CurrentUser() u: any, @Body() dto: VerifyEpodDto) {
    return this.svc.verify(id, u.companyId, dto);
  }

  @Post(':id/dispute')
  dispute(@Param('id') id: string, @CurrentUser() u: any, @Body() dto: DisputeEpodDto) {
    return this.svc.dispute(id, u.companyId, dto);
  }
}
