import { Controller, Get, Post, Param, Query, Res, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { UserRole } from '@prisma/client';
import { AccountingIntegrationsService } from './accounting-integrations.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Accounting Integrations')
@ApiBearerAuth()
@Controller()
export class AccountingIntegrationsController {
  constructor(private readonly svc: AccountingIntegrationsService) {}

  @Get('accounting/integrations')
  list(@CurrentUser() u: any) {
    return this.svc.listConnections(u.companyId);
  }

  // AI reconciliation — the unique bridge feature
  @Get('accounting/integrations/reconcile')
  reconcile(@CurrentUser() u: any) {
    return this.svc.reconcile(u.companyId);
  }

  @Get('accounting/integrations/logs')
  logs(@CurrentUser() u: any) {
    return this.svc.listLogs(u.companyId);
  }

  // OAuth redirect target (browser hits this from Xero/Sage — no JWT).
  @Public()
  @Get('accounting/integrations/callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const redirect = await this.svc.handleCallback(code, state);
    res.redirect(redirect);
  }

  @Post('accounting/integrations/pastel/connect')
  connectPastel(@CurrentUser() u: any) {
    return this.svc.connectPastel(u.companyId);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.VIEWER)
  @Get('accounting/integrations/pastel/export')
  async pastelExport(@CurrentUser() u: any, @Query() q: any, @Res() res: Response) {
    const { filename, csv } = await this.svc.exportPastel(u.companyId, q);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  // Begin OAuth for Xero / Sage — returns the authorize URL for the UI to open.
  @Get('accounting/integrations/:provider/authorize')
  authorize(@Param('provider') provider: string, @CurrentUser() u: any) {
    return this.svc.getAuthUrl(u.companyId, provider.toUpperCase() as any);
  }

  @Post('accounting/integrations/sync/invoice/:invoiceId')
  syncInvoice(@Param('invoiceId') invoiceId: string, @CurrentUser() u: any) {
    return this.svc.syncInvoice(u.companyId, invoiceId);
  }

  @Post('accounting/integrations/sync/credit-note/:creditNoteId')
  syncCreditNote(@Param('creditNoteId') creditNoteId: string, @CurrentUser() u: any) {
    return this.svc.syncCreditNote(u.companyId, creditNoteId);
  }

  @Post('accounting/integrations/:id/disconnect')
  disconnect(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.disconnect(id, u.companyId);
  }
}
