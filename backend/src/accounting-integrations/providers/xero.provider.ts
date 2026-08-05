import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  AccountingProviderAdapter, AccountingDoc, OAuthTokens, ProviderConnection, PushResult,
} from './types';

/**
 * Xero adapter — OAuth2 + push of invoices / credit notes via the Accounting API.
 * Requires XERO_CLIENT_ID / XERO_CLIENT_SECRET and a redirect URI registered in
 * the Xero developer app pointing at <API_PUBLIC_URL>/accounting/integrations/callback.
 */
@Injectable()
export class XeroProvider implements AccountingProviderAdapter {
  readonly key = 'XERO' as const;
  readonly name = 'Xero';
  readonly usesOAuth = true;
  private readonly logger = new Logger('XeroProvider');

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly scope =
    'offline_access accounting.transactions accounting.contacts accounting.settings';

  constructor(private config: ConfigService) {
    this.clientId = config.get<string>('XERO_CLIENT_ID', '');
    this.clientSecret = config.get<string>('XERO_CLIENT_SECRET', '');
    const base = config.get<string>('API_PUBLIC_URL', 'https://api.flowop.work/api/v1');
    this.redirectUri = `${base}/accounting/integrations/callback`;
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scope,
      state,
    });
    return `https://login.xero.com/identity/connect/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const tokens = await this.token({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
    });
    // Resolve the Xero tenant (organisation) to scope API calls.
    const conns = await axios.get('https://api.xero.com/connections', {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const first = conns.data?.[0];
    return { ...tokens, tenantId: first?.tenantId ?? null, tenantName: first?.tenantName ?? null };
  }

  async refresh(refreshToken: string): Promise<OAuthTokens> {
    return this.token({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  private async token(body: Record<string, string>): Promise<OAuthTokens> {
    if (!this.isConfigured()) throw new BadRequestException('Xero is not configured (XERO_CLIENT_ID/SECRET).');
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await axios.post('https://identity.xero.com/connect/token', new URLSearchParams(body).toString(), {
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return {
      accessToken: res.data.access_token,
      refreshToken: res.data.refresh_token,
      expiresInSec: res.data.expires_in,
    };
  }

  async pushInvoice(conn: ProviderConnection, doc: AccountingDoc): Promise<PushResult> {
    return this.post(conn, 'Invoices', {
      Invoices: [{
        Type: 'ACCREC',
        Contact: { Name: doc.clientName, EmailAddress: doc.clientEmail ?? undefined },
        Date: this.d(doc.date),
        DueDate: doc.dueDate ? this.d(doc.dueDate) : undefined,
        InvoiceNumber: doc.number,
        Reference: doc.reference,
        LineAmountTypes: 'Exclusive',
        LineItems: this.lines(conn, doc),
        Status: 'AUTHORISED',
      }],
    }, 'Invoices');
  }

  async pushCreditNote(conn: ProviderConnection, doc: AccountingDoc): Promise<PushResult> {
    return this.post(conn, 'CreditNotes', {
      CreditNotes: [{
        Type: 'ACCRECCREDIT',
        Contact: { Name: doc.clientName, EmailAddress: doc.clientEmail ?? undefined },
        Date: this.d(doc.date),
        CreditNoteNumber: doc.number,
        Reference: doc.reference,
        LineAmountTypes: 'Exclusive',
        LineItems: this.lines(conn, doc),
        Status: 'AUTHORISED',
      }],
    }, 'CreditNotes');
  }

  private lines(conn: ProviderConnection, doc: AccountingDoc) {
    const salesAccount = conn.settings?.salesAccountCode ?? '200';
    return doc.lineItems.map((l) => ({
      Description: l.description,
      Quantity: l.quantity,
      UnitAmount: l.unitAmount,
      AccountCode: l.accountCode ?? salesAccount,
      TaxType: l.taxType ?? 'OUTPUT2',
    }));
  }

  private async post(conn: ProviderConnection, edge: string, body: any, key: string): Promise<PushResult> {
    if (!conn.accessToken || !conn.externalTenantId) {
      throw new BadRequestException('Xero connection is missing an access token / tenant.');
    }
    try {
      const res = await axios.post(`https://api.xero.com/api.xro/2.0/${edge}`, body, {
        headers: {
          Authorization: `Bearer ${conn.accessToken}`,
          'Xero-tenant-id': conn.externalTenantId,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });
      const created = res.data?.[key]?.[0];
      const externalId = created?.InvoiceID ?? created?.CreditNoteID ?? created?.InvoiceNumberID ?? 'unknown';
      return { externalId, raw: created };
    } catch (err: any) {
      const detail = err?.response?.data?.Message ?? err?.response?.data?.Detail ?? err.message;
      this.logger.error(`Xero push failed: ${detail}`);
      throw new BadRequestException(`Xero rejected the document: ${detail}`);
    }
  }

  private d(date: Date): string {
    return new Date(date).toISOString().slice(0, 10);
  }
}
