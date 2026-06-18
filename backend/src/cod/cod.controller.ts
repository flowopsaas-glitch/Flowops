import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CodService } from './cod.service';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('COD Reconciliation')
@ApiBearerAuth()
@Controller('cod')
export class CodController {
  constructor(private readonly svc: CodService) {}

  @Get('summary')
  getSummary(@CurrentUser() u: any) {
    return this.svc.getSummary(u.companyId);
  }

  @Get('outstanding')
  getOutstanding(@CurrentUser() u: any) {
    return this.svc.getOutstandingWaybills(u.companyId);
  }

  @Post('collect/:waybillId')
  recordCollection(@Param('waybillId') waybillId: string, @CurrentUser() u: any) {
    return this.svc.recordCollection(waybillId, u.companyId, u.id);
  }

  @Post('settle/:driverId')
  settle(
    @Param('driverId') driverId: string,
    @Body() body: { amount: number; note?: string },
    @CurrentUser() u: any,
  ) {
    return this.svc.settleDriver(driverId, body.amount, u.companyId, body.note);
  }

  @Get('wallets')
  listWallets(@CurrentUser() u: any) {
    return this.svc.listWallets(u.companyId);
  }

  @Get('wallets/:driverId')
  getWallet(@Param('driverId') driverId: string) {
    return this.svc.getWallet(driverId);
  }
}
