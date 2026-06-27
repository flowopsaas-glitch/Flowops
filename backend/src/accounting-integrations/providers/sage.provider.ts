import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  AccountingProviderAdapter, AccountingDoc, OAuthTokens, ProviderConnection, PushResult,
} from './types';

/**
 * Sage Business Cloud Accounting adapter (API v3.1) — OAuth2 + sales invoice /
 * credit note push. Requires SAGE_CLIENT_ID / SAGE_CLIENT_SECRET.
 */
@Injectable()
export class SageProvider implements AccountingProviderAdapter {
  readonly key = 'SAGE' as const;
  readonly name = 'Sage Accounting';
  readonly usesOAuth = true;
  private readonly logger = new Logger('SageProvider');

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly api = 'https://api.accounting.sage.com/v3.1';

  constructor(private config: ConfigService) {
    this.clientId = config.get<string>('SAGE_CLIENT_ID', '');
    this.clientSecret = config.get<string>('SAGE_CLIENT_SECRET', '');
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
      scope: 'full_access',
      filter: 'apiv3.1',
      country: 'za',
      state,
    });
    return `https://www.sageone.com/oauth2/auth/central?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    return this.token({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
    });
  }

  async refresh(refreshToken: string): Promise<OAuthTokens> {
    return this.token({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  private async token(extra: Record<string, string>): Promise<OAuthTokens> {
    if (!this.isConfigured()) throw new BadRequestException('Sage is not configured (SAGE_CLIENT_ID/SECRET).');
    const body = { client_id: this.clientId, client_secret: this.clientSecret, ...extra };
    const res = await axios.post('https://oauth.accounting.sage.com/token', new URLSearchParams(body).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return {
      accessToken: res.data.access_token,
      refreshToken: res.data.refresh_token,
      expiresInSec: res.data.expires_in,
      tenantName: 'Sage Accounting',
    };
  }

  async pushInvoice(conn: ProviderConnection, doc: AccountingDoc): Promise<PushResult> {
    return this.post(conn, 'sales_invoices', {
      sales_invoice: {
        contact_name: doc.clientName,
        date: this.d(doc.date),
        due_date: doc.dueDate ? this.d(doc.dueDate) : undefined,
        reference: doc.number,
        invoice_lines: doc.lineItems.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unitAmount,
        })),
      },
    });
  }

  async pushCreditNote(conn: ProviderConnection, doc: AccountingDoc): Promise<PushResult> {
    return this.post(conn, 'sales_credit_notes', {
      sales_credit_note: {
        contact_name: doc.clientName,
        date: this.d(doc.date),
        reference: doc.number,
        credit_note_lines: doc.lineItems.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unitAmount,
        })),
      },
    });
  }

  private async post(conn: ProviderConnection, edge: string, body: any): Promise<PushResult> {
    if (!conn.accessToken) throw new BadRequestException('Sage connection is missing an access token.');
    try {
      const res = await axios.post(`${this.api}/${edge}`, body, {
        headers: { Authorization: `Bearer ${conn.accessToken}`, 'Content-Type': 'application/json' },
      });
      return { externalId: res.data?.id ?? res.data?.displayed_as ?? 'unknown', raw: res.data };
    } catch (err: any) {
      const detail = err?.response?.data?.['$error']?.message ?? err?.response?.data?.message ?? err.message;
      this.logger.error(`Sage push failed: ${detail}`);
      throw new BadRequestException(`Sage rejected the document: ${detail}`);
    }
  }

  private d(date: Date): string {
    return new Date(date).toISOString().slice(0, 10);
  }
}
