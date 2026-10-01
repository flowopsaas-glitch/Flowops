import {
  Controller, Get, Post, Patch, Body, Param, Query, Res, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AccountingService } from './accounting.service';
import { CreateNoteDto, UpdateNoteDto, ApplyCreditNoteDto } from './dto/note.dto';
import { CreateSalespersonDto, UpdateSalespersonDto, GenerateCommissionDto } from './dto/commission.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';

const FINANCE_WRITE_ROLES = [UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER] as const;

@ApiTags('Accounting')
@ApiBearerAuth()
@UseGuards(FeatureGuard)
@RequireFeature('accounting')
@Controller()
export class AccountingController {
  constructor(private readonly svc: AccountingService) {}

  // ── Credit notes ──────────────────────────────────────────────────────
  @Get('credit-notes')
  listCredit(@CurrentUser() u: any, @Query() q: any) { return this.svc.listCreditNotes(u.companyId, q); }

  @Get('credit-notes/:id')
  getCredit(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.getCreditNote(id, u.companyId); }

  @Roles(...FINANCE_WRITE_ROLES)
  @Post('credit-notes')
  createCredit(@CurrentUser() u: any, @Body() body: CreateNoteDto) { return this.svc.createCreditNote(u.companyId, body); }

  @Roles(...FINANCE_WRITE_ROLES)
  @Patch('credit-notes/:id')
  updateCredit(@Param('id') id: string, @CurrentUser() u: any, @Body() body: UpdateNoteDto) {
    return this.svc.updateCreditNote(id, u.companyId, body);
  }

  @Roles(...FINANCE_WRITE_ROLES)
  @Post('credit-notes/:id/issue')
  issueCredit(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.issueCreditNote(id, u.companyId); }

  @Roles(...FINANCE_WRITE_ROLES)
  @Post('credit-notes/:id/apply')
  applyCredit(@Param('id') id: string, @CurrentUser() u: any, @Body() body: ApplyCreditNoteDto) {
    return this.svc.applyCreditNote(id, u.companyId, body ?? {});
  }

  @Roles(...FINANCE_WRITE_ROLES)
  @Post('credit-notes/:id/void')
  voidCredit(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.voidCreditNote(id, u.companyId); }

  // ── Debit notes ───────────────────────────────────────────────────────
  @Get('debit-notes')
  listDebit(@CurrentUser() u: any, @Query() q: any) { return this.svc.listDebitNotes(u.companyId, q); }

  @Get('debit-notes/:id')
  getDebit(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.getDebitNote(id, u.companyId); }

  @Roles(...FINANCE_WRITE_ROLES)
  @Post('debit-notes')
  createDebit(@CurrentUser() u: any, @Body() body: CreateNoteDto) { return this.svc.createDebitNote(u.companyId, body); }

  @Roles(...FINANCE_WRITE_ROLES)
  @Patch('debit-notes/:id')
  updateDebit(@Param('id') id: string, @CurrentUser() u: any, @Body() body: UpdateNoteDto) {
    return this.svc.updateDebitNote(id, u.companyId, body);
  }

  @Roles(...FINANCE_WRITE_ROLES)
  @Post('debit-notes/:id/issue')
  issueDebit(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.issueDebitNote(id, u.companyId); }

  @Roles(...FINANCE_WRITE_ROLES)
  @Post('debit-notes/:id/settle')
  settleDebit(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.settleDebitNote(id, u.companyId); }

  @Roles(...FINANCE_WRITE_ROLES)
  @Post('debit-notes/:id/void')
  voidDebit(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.voidDebitNote(id, u.companyId); }

  // ── Statements + age analysis ───────────────────────────────────────────
  @Get('accounting/statement')
  statement(@CurrentUser() u: any, @Query('client') client: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.getStatement(u.companyId, client, from, to);
  }

  @Get('accounting/age-analysis')
  ageAnalysis(@CurrentUser() u: any) { return this.svc.getAgeAnalysis(u.companyId); }

  // ── AI finance assistant ────────────────────────────────────────────────
  @Get('accounting/ai-assist')
  aiAssist(@CurrentUser() u: any) { return this.svc.aiAssist(u.companyId); }

  // ── Salespeople + commission ────────────────────────────────────────────
  @Get('salespeople')
  listSalespeople(@CurrentUser() u: any) { return this.svc.listSalespeople(u.companyId); }

  @Roles(...FINANCE_WRITE_ROLES)
  @Post('salespeople')
  createSalesperson(@CurrentUser() u: any, @Body() body: CreateSalespersonDto) {
    return this.svc.createSalesperson(u.companyId, body);
  }

  @Roles(...FINANCE_WRITE_ROLES)
  @Patch('salespeople/:id')
  updateSalesperson(@Param('id') id: string, @CurrentUser() u: any, @Body() body: UpdateSalespersonDto) {
    return this.svc.updateSalesperson(id, u.companyId, body);
  }

  @Get('commissions')
  listCommissions(@CurrentUser() u: any, @Query() q: any) { return this.svc.listCommissions(u.companyId, q); }

  @Get('commissions/summary')
  commissionSummary(@CurrentUser() u: any, @Query('periodMonth') periodMonth?: string) {
    return this.svc.commissionSummary(u.companyId, periodMonth);
  }

  @Roles(...FINANCE_WRITE_ROLES)
  @Post('commissions/generate')
  generateCommissions(@CurrentUser() u: any, @Body() body: GenerateCommissionDto) {
    return this.svc.generateCommissions(u.companyId, body);
  }

  @Roles(...FINANCE_WRITE_ROLES)
  @Post('commissions/:id/approve')
  approveCommission(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.setCommissionStatus(id, u.companyId, 'APPROVED');
  }

  @Roles(...FINANCE_WRITE_ROLES)
  @Post('commissions/:id/mark-paid')
  payCommission(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.setCommissionStatus(id, u.companyId, 'PAID');
  }

  @Roles(...FINANCE_WRITE_ROLES)
  @Post('commissions/:id/void')
  voidCommission(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.setCommissionStatus(id, u.companyId, 'VOID');
  }

  // ── CSV / Pastel export ─────────────────────────────────────────────────
  // Financial export is staff/finance-only.
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.VIEWER)
  @Get('accounting/export/:type')
  async export(@Param('type') type: string, @CurrentUser() u: any, @Query() q: any, @Res() res: any) {
    const { filename, csv } = await this.svc.exportCsv(u.companyId, type, q);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
