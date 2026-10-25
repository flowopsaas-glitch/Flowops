import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DigitalPaymentsService } from './digital-payments.service';
import { CreatePaymentDto, ConfirmPaymentDto } from './dto/digital-payment.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
const DIGITAL_PAYMENT_READ_ROLES = [
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
  UserRole.VIEWER,
];


@ApiTags('Digital Payments')
@ApiBearerAuth()
@UseGuards(FeatureGuard)
@RequireFeature('digitalPayments')
@Roles(...DIGITAL_PAYMENT_READ_ROLES)
@Controller('digital-payments')
export class DigitalPaymentsController {
  constructor(private readonly svc: DigitalPaymentsService) {}

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @Post()
  create(@CurrentUser() u: any, @Body() dto: CreatePaymentDto) {
    return this.svc.createPayment(u.companyId, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @Post('confirm')
  confirm(@CurrentUser() u: any, @Body() dto: ConfirmPaymentDto) {
    return this.svc.confirmPayment(u.companyId, dto);
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

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @Post(':id/fail')
  fail(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.failPayment(id, u.companyId);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @Post(':id/refund')
  refund(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.refundPayment(id, u.companyId);
  }
}
