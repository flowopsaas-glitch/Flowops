import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import { CodService } from './cod.service';

@ApiTags('COD Reconciliation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cod')
export class CodController {
  constructor(private readonly svc: CodService) {}

  /** Platform summary: outstanding, collected, settled totals */
  @Get('summary')
  summary(@CurrentUser() user: any) {
    return this.svc.getSummary(user.companyId);
  }

  /** All outstanding COD waybills (amount set, not yet collected) */
  @Get('outstanding')
  outstanding(@CurrentUser() user: any) {
    return this.svc.getOutstanding(user.companyId);
  }

  /** All driver wallets for the tenant */
  @Get('wallets')
  wallets(@CurrentUser() user: any) {
    return this.svc.listWallets(user.companyId);
  }

  /** Wallet detail + transaction history for a specific driver */
  @Get('wallets/:driverId')
  driverWallet(@Param('driverId') driverId: string, @CurrentUser() user: any) {
    return this.svc.getDriverWallet(driverId, user.companyId);
  }

  /** Full transaction ledger for the tenant */
  @Get('transactions')
  transactions(@Query('limit') limit: string, @CurrentUser() user: any) {
    return this.svc.listTransactions(user.companyId, Number(limit) || 100);
  }

  /** Record that a driver collected cash from a recipient */
  @Post('collect')
  collect(
    @Body() body: { waybillId: string; driverId: string; amount?: number },
    @CurrentUser() user: any,
  ) {
    return this.svc.recordCollection(
      body.waybillId,
      body.driverId,
      user.companyId,
      body.amount,
    );
  }

  /** Settle a driver: record cash remittance to the company */
  @Post('settle/:driverId')
  settle(
    @Param('driverId') driverId: string,
    @Body() body: { amount: number; notes?: string },
    @CurrentUser() user: any,
  ) {
    return this.svc.settleDriver(driverId, user.companyId, body.amount, body.notes);
  }

  /** Manual wallet adjustment (overages, expenses, corrections) */
  @Post('adjust/:driverId')
  adjust(
    @Param('driverId') driverId: string,
    @Body() body: { amount: number; notes: string },
    @CurrentUser() user: any,
  ) {
    return this.svc.adjustWallet(driverId, user.companyId, body.amount, body.notes);
  }
}
