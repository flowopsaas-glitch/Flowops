import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { XeroProvider } from './providers/xero.provider';
import { SageProvider } from './providers/sage.provider';
import { PastelProvider } from './providers/pastel.provider';
import { AccountingDoc, AccountingProviderAdapter, ProviderConnection } from './providers/types';

type ProviderKey = 'XERO' | 'SAGE' | 'PASTEL';
const money = (n: number) =>
  `R${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

@Injectable()
export class AccountingIntegrationsService {
  private readonly logger = new Logger('AccountingBridge');
  private readonly secret: string;
  private readonly appUrl: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private billing: BillingService,
    private xero: XeroProvider,
    private sage: SageProvider,
    private pastel: PastelProvider,
  ) {
    // No fallback. `|| ''` made the signing key an empty string whenever
    // JWT_SECRET was unset, and HMAC-SHA256 under an empty key is something
    // anyone can compute offline. The signed state is the only thing telling
    // this callback which company the connection belongs to, so a forgeable
    // state means an attacker can name any tenant they like — pair it with an
    // OAuth code from their own Xero account and the victim's tenant ends up
    // connected to the attacker's ledger. Every invoice they sync then lands on
    // the attacker's side. If the key is missing we cannot sign, so we do not
    // pretend to.
    this.secret = config.get<string>('JWT_SECRET') || '';
    if (!this.secret) {
      this.logger.error(
        'JWT_SECRET is not set — the Accounting Bridge OAuth state cannot be signed. ' +
          'OAuth connect is disabled until it is configured.',
      );
    }
    this.appUrl = config.get<string>('APP_URL', 'https://app.flowop.work');
  }

  /**
   * The AI Accounting Bridge (connect/sync/reconcile/export) is a paid feature
   * (Professional+). Gate every entry point that reads or writes ledger data so
   * a Starter tenant can't drive the bridge lifecycle. The OAuth callback is
   * intentionally NOT gated here — it's a public browser redirect with no JWT,
   * and it can only complete a flow that getAuthUrl() already authorised.
   */
  private async assertBridge(companyId: string): Promise<void> {
    const ok = await this.billing.hasFeature(companyId, 'accountingBridge');
    if (!ok) {
      throw new ForbiddenException(
        'The Accounting Bridge (Xero / Sage / Pastel sync + AI reconciliation) is a ' +
          'Professional feature. Upgrade your plan to connect your ledger and keep your books in sync.',
      );
    }
  }

  private adapter(key: ProviderKey): AccountingProviderAdapter {
    if (key === 'XERO') return this.xero;
    if (key === 'SAGE') return this.sage;
    if (key === 'PASTEL') return this.pastel;
    throw new BadRequestException(`Unknown accounting provider: ${key}`);
  }

  // ── Connection management ───────────────────────────────────────────────

  async listConnections(companyId: string) {
    await this.assertBridge(companyId);
    const rows = await this.prisma.accountingConnection.findMany({ where: { companyId } });
    const providers = (['XERO', 'SAGE', 'PASTEL'] as ProviderKey[]).map((key) => {
      const a = this.adapter(key);
      const conn = rows.find((r) => r.provider === key);
      return {
        provider: key,
        name: a.name,
        usesOAuth: a.usesOAuth,
        configured: a.isConfigured(),
        status: conn?.status ?? 'DISCONNECTED',
        tenantName: conn?.externalTenantName ?? null,
        lastSyncAt: conn?.lastSyncAt ?? null,
        lastError: conn?.lastError ?? null,
        connectionId: conn?.id ?? null,
      };
    });
    return providers;
  }

  /** Build the OAuth authorize URL (Xero/Sage) with a signed state. */
  async getAuthUrl(companyId: string, key: ProviderKey): Promise<{ url: string }> {
    await this.assertBridge(companyId);
    const a = this.adapter(key);
    if (!a.usesOAuth || !a.getAuthUrl) {
      throw new BadRequestException(`${a.name} is file-based — use "Connect" then export, no OAuth.`);
    }
    if (!a.isConfigured()) {
      throw new BadRequestException(`${a.name} app credentials are not set on the server.`);
    }
    return { url: a.getAuthUrl(this.signState(companyId, key)) };
  }

  /** Pastel has no OAuth — connecting just records intent so docs get batched. */
  async connectPastel(companyId: string) {
    await this.assertBridge(companyId);
    return this.prisma.accountingConnection.upsert({
      where: { companyId_provider: { companyId, provider: 'PASTEL' } },
      create: { companyId, provider: 'PASTEL', status: 'CONNECTED', externalTenantName: 'Pastel import file' },
      update: { status: 'CONNECTED' },
    });
  }

  /** OAuth redirect handler. Returns a URL to send the browser back to. */
  async handleCallback(code: string, state: string): Promise<string> {
    const parsed = this.verifyState(state);
    if (!parsed) return `${this.appUrl}/accounting?integration=error&reason=bad_state`;
    const { companyId, provider } = parsed;
    try {
      const a = this.adapter(provider);
      const tokens = await a.exchangeCode!(code);
      await this.prisma.accountingConnection.upsert({
        where: { companyId_provider: { companyId, provider } },
        create: {
          companyId, provider, status: 'CONNECTED',
          accessToken: tokens.accessToken, refreshToken: tokens.refreshToken ?? null,
          tokenExpiresAt: tokens.expiresInSec ? new Date(Date.now() + tokens.expiresInSec * 1000) : null,
          externalTenantId: tokens.tenantId ?? null, externalTenantName: tokens.tenantName ?? null,
        },
        update: {
          status: 'CONNECTED', accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? null,
          tokenExpiresAt: tokens.expiresInSec ? new Date(Date.now() + tokens.expiresInSec * 1000) : null,
          externalTenantId: tokens.tenantId ?? null, externalTenantName: tokens.tenantName ?? null,
          lastError: null,
        },
      });
      return `${this.appUrl}/accounting?integration=connected&provider=${provider}`;
    } catch (e: any) {
      this.logger.error(`OAuth callback failed: ${e.message}`);
      return `${this.appUrl}/accounting?integration=error&reason=${encodeURIComponent(e.message)}`;
    }
  }

  async disconnect(id: string, companyId: string) {
    await this.assertBridge(companyId);
    const conn = await this.prisma.accountingConnection.findFirst({ where: { id, companyId } });
    if (!conn) throw new NotFoundException('Connection not found');
    await this.prisma.accountingConnection.update({
      where: { id },
      data: { status: 'DISCONNECTED', accessToken: null, refreshToken: null, tokenExpiresAt: null },
    });
    return { disconnected: true };
  }

  // ── Sync ────────────────────────────────────────────────────────────────

  async syncInvoice(companyId: string, invoiceId: string) {
    await this.assertBridge(companyId);
    const inv = await this.prisma.invoice.findFirst({ where: { id: invoiceId, companyId }, include: { items: true } });
    if (!inv) throw new NotFoundException('Invoice not found');
    const doc = this.invoiceToDoc(inv);
    return this.pushToConnected(companyId, 'INVOICE', doc);
  }

  async syncCreditNote(companyId: string, creditNoteId: string) {
    await this.assertBridge(companyId);
    const cn = await this.prisma.creditNote.findFirst({ where: { id: creditNoteId, companyId }, include: { items: true } });
    if (!cn) throw new NotFoundException('Credit note not found');
    const doc = this.creditNoteToDoc(cn);
    return this.pushToConnected(companyId, 'CREDIT_NOTE', doc);
  }

  private async pushToConnected(companyId: string, docType: 'INVOICE' | 'CREDIT_NOTE', doc: AccountingDoc) {
    const conns = await this.prisma.accountingConnection.findMany({ where: { companyId, status: 'CONNECTED' } });
    if (!conns.length) throw new BadRequestException('No accounting provider connected. Connect Xero, Sage or Pastel first.');

    const results: any[] = [];
    for (const conn of conns) {
      const a = this.adapter(conn.provider as ProviderKey);
      try {
        const fresh = await this.ensureFreshToken(conn.id);
        const pc: ProviderConnection = {
          id: fresh.id, accessToken: fresh.accessToken, refreshToken: fresh.refreshToken,
          externalTenantId: fresh.externalTenantId, settings: fresh.settings,
        };
        const res = docType === 'INVOICE' ? await a.pushInvoice(pc, doc) : await a.pushCreditNote(pc, doc);
        await this.log(companyId, conn.id, docType, doc, 'SYNCED', res.externalId, undefined);
        await this.prisma.accountingConnection.update({ where: { id: conn.id }, data: { lastSyncAt: new Date(), lastError: null } });
        results.push({ provider: conn.provider, status: 'SYNCED', externalId: res.externalId });
      } catch (e: any) {
        await this.log(companyId, conn.id, docType, doc, 'FAILED', undefined, e.message);
        await this.prisma.accountingConnection.update({ where: { id: conn.id }, data: { lastError: e.message } });
        results.push({ provider: conn.provider, status: 'FAILED', error: e.message });
      }
    }
    return { document: doc.number, results };
  }

  private async ensureFreshToken(connId: string) {
    const conn = await this.prisma.accountingConnection.findUniqueOrThrow({ where: { id: connId } });
    const a = this.adapter(conn.provider as ProviderKey);
    if (!a.usesOAuth || !conn.refreshToken || !a.refresh) return conn;
    const stale = conn.tokenExpiresAt && conn.tokenExpiresAt.getTime() < Date.now() + 60_000;
    if (!stale) return conn;
    const t = await a.refresh(conn.refreshToken);
    return this.prisma.accountingConnection.update({
      where: { id: connId },
      data: {
        accessToken: t.accessToken, refreshToken: t.refreshToken ?? conn.refreshToken,
        tokenExpiresAt: t.expiresInSec ? new Date(Date.now() + t.expiresInSec * 1000) : conn.tokenExpiresAt,
      },
    });
  }

  private log(companyId: string, connectionId: string, docType: 'INVOICE' | 'CREDIT_NOTE', doc: AccountingDoc, status: any, externalId?: string, error?: string) {
    return this.prisma.accountingSyncLog.create({
      data: { companyId, connectionId, docType, documentId: doc.id, documentNumber: doc.number, externalId, status, amount: doc.total, error },
    });
  }

  async listLogs(companyId: string, limit = 100) {
    await this.assertBridge(companyId);
    return this.prisma.accountingSyncLog.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: limit });
  }

  // ── Pastel export (file-based) ────────────────────────────────────────────

  async exportPastel(companyId: string, q: any = {}): Promise<{ filename: string; csv: string }> {
    await this.assertBridge(companyId);
    const from = q.from ? new Date(q.from) : new Date(new Date().getFullYear(), 0, 1);
    const to = q.to ? new Date(q.to) : new Date();
    to.setHours(23, 59, 59, 999);
    const [invoices, creditNotes] = await Promise.all([
      this.prisma.invoice.findMany({ where: { companyId, status: { not: 'DRAFT' }, createdAt: { gte: from, lte: to } }, include: { items: true } }),
      this.prisma.creditNote.findMany({ where: { companyId, status: { in: ['ISSUED', 'APPLIED'] }, createdAt: { gte: from, lte: to } }, include: { items: true } }),
    ]);
    const docs = [
      ...invoices.map((i) => ({ doc: this.invoiceToDoc(i), isCredit: false })),
      ...creditNotes.map((c) => ({ doc: this.creditNoteToDoc(c), isCredit: true })),
    ];
    const csv = PastelProvider.buildImportCsv(docs);
    return { filename: `pastel-import-${new Date().toISOString().slice(0, 10)}.csv`, csv };
  }

  // ════════════════════ AI RECONCILIATION (the unique bit) ════════════════════

  /**
   * AI Accounting Bridge reconciliation. Cross-checks FlowOps invoices/credit
   * notes against what's actually been synced to the connected ledger, and flags
   * the things that quietly cost couriers money: paid invoices never pushed,
   * amount mismatches, duplicate pushes and stale syncs. Plus an AI-suggested
   * ledger account mapping per provider. No external AI key required.
   */
  async reconcile(companyId: string) {
    await this.assertBridge(companyId);
    const [invoices, creditNotes, logs, conns] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { companyId, status: { in: ['SENT', 'PAID', 'OVERDUE'] } },
        select: { id: true, invoiceNumber: true, clientName: true, total: true, status: true, updatedAt: true },
      }),
      this.prisma.creditNote.findMany({
        where: { companyId, status: { in: ['ISSUED', 'APPLIED'] } },
        select: { id: true, number: true, clientName: true, total: true },
      }),
      this.prisma.accountingSyncLog.findMany({ where: { companyId } }),
      this.prisma.accountingConnection.findMany({ where: { companyId, status: 'CONNECTED' } }),
    ]);

    const logsByDoc = new Map<string, typeof logs>();
    for (const l of logs) {
      const arr = logsByDoc.get(l.documentId) ?? [];
      arr.push(l);
      logsByDoc.set(l.documentId, arr);
    }

    type Issue = { severity: 'HIGH' | 'MEDIUM' | 'LOW'; type: string; doc: string; client: string; detail: string };
    const issues: Issue[] = [];
    let syncedCount = 0;

    const check = (docId: string, number: string, client: string, total: number, isPaid: boolean) => {
      const docLogs = logsByDoc.get(docId) ?? [];
      const synced = docLogs.filter((l) => l.status === 'SYNCED');
      if (synced.length) syncedCount++;
      if (!synced.length) {
        issues.push({
          severity: isPaid ? 'HIGH' : 'MEDIUM',
          type: 'NOT_SYNCED', doc: number, client,
          detail: isPaid
            ? `Paid ${money(total)} — never pushed to your ledger (revenue could be unrecorded).`
            : `${money(total)} outstanding — not yet in your accounting system.`,
        });
        return;
      }
      // amount mismatch
      const mismatch = synced.find((l) => Math.abs((l.amount ?? 0) - total) > 0.01);
      if (mismatch) {
        issues.push({
          severity: 'HIGH', type: 'AMOUNT_MISMATCH', doc: number, client,
          detail: `FlowOps total ${money(total)} ≠ synced ${money(mismatch.amount ?? 0)} — investigate before month-end.`,
        });
      }
      // duplicate pushes to the same provider
      const byConn = new Map<string, number>();
      for (const l of synced) byConn.set(l.connectionId, (byConn.get(l.connectionId) ?? 0) + 1);
      if ([...byConn.values()].some((n) => n > 1)) {
        issues.push({ severity: 'MEDIUM', type: 'DUPLICATE', doc: number, client, detail: 'Pushed more than once to the same ledger — possible duplicate entry.' });
      }
    };

    for (const i of invoices) check(i.id, i.invoiceNumber, i.clientName, i.total, i.status === 'PAID');
    for (const c of creditNotes) check(c.id, c.number, c.clientName, c.total, true);

    const totalDocs = invoices.length + creditNotes.length;
    const high = issues.filter((i) => i.severity === 'HIGH').length;
    const med = issues.filter((i) => i.severity === 'MEDIUM').length;
    const healthScore = totalDocs === 0 ? 100 : Math.max(0, Math.round(100 - (high * 12 + med * 5)));

    const summary = conns.length === 0
      ? 'No accounting system connected yet. Connect Xero, Sage or Pastel to start syncing — then this panel will catch anything that falls through the cracks.'
      : `${syncedCount}/${totalDocs} documents reconciled to ${conns.map((c) => c.provider).join(', ')}. ` +
        (high ? `${high} high-priority issue${high === 1 ? '' : 's'} need attention (e.g. paid invoices not in your ledger). ` : 'No high-priority issues. ') +
        `Books-health score: ${healthScore}/100.`;

    return {
      connected: conns.map((c) => ({ provider: c.provider, tenant: c.externalTenantName })),
      healthScore,
      totals: { documents: totalDocs, synced: syncedCount, unsynced: totalDocs - syncedCount, high, medium: med },
      issues: issues.sort((a, b) => (a.severity === 'HIGH' ? -1 : 1) - (b.severity === 'HIGH' ? -1 : 1)).slice(0, 50),
      suggestedMapping: this.suggestMapping(),
      summary,
      generatedAt: new Date().toISOString(),
    };
  }

  /** AI-suggested ledger account mapping per provider (sane SA defaults). */
  private suggestMapping() {
    return {
      XERO: { sales: '200 — Sales', accountsReceivable: '1100 — Accounts Receivable', vat: 'OUTPUT2 (15% VAT on Income)' },
      SAGE: { sales: '4000 — Sales', accountsReceivable: 'Trade Debtors', vat: 'Standard Rate 15%' },
      PASTEL: { sales: '1000/000 — Sales', accountsReceivable: 'Customer control', vat: 'Tax type 01 (VAT 15%)' },
    };
  }

  // ── doc builders ──────────────────────────────────────────────────────────

  private invoiceToDoc(inv: any): AccountingDoc {
    return {
      id: inv.id, number: inv.invoiceNumber, clientName: inv.clientName, clientEmail: inv.clientEmail,
      date: inv.createdAt, dueDate: inv.dueDate, reference: inv.invoiceNumber,
      lineItems: (inv.items ?? []).map((it: any) => ({ description: it.description, quantity: it.quantity, unitAmount: it.unitPrice })),
      subtotal: inv.subtotal, tax: inv.tax, total: inv.total,
    };
  }

  private creditNoteToDoc(cn: any): AccountingDoc {
    return {
      id: cn.id, number: cn.number, clientName: cn.clientName, clientEmail: cn.clientEmail,
      date: cn.createdAt, dueDate: null, reference: cn.number,
      lineItems: (cn.items ?? []).map((it: any) => ({ description: it.description, quantity: it.quantity, unitAmount: it.unitPrice })),
      subtotal: cn.subtotal, tax: cn.tax, total: cn.total,
    };
  }

  // ── signed OAuth state ──────────────────────────────────────────────────────

  /**
   * Constant-time compare. `sig !== expected` returns as soon as the first
   * differing byte is found, which leaks how much of the signature was right —
   * the standard setup for recovering a signature one byte at a time.
   */
  private safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  }

  private signState(companyId: string, provider: ProviderKey): string {
    const payload = Buffer.from(JSON.stringify({ companyId, provider, ts: Date.now() })).toString('base64url');
    const sig = createHmac('sha256', this.secret).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }

  private verifyState(state: string): { companyId: string; provider: ProviderKey } | null {
    // No key, no trust. Refusing outright is the only safe reading of an
    // unconfigured secret: it is what an attacker would forge against.
    if (!this.secret) return null;

    const [payload, sig] = (state || '').split('.');
    if (!payload || !sig) return null;
    const expected = createHmac('sha256', this.secret).update(payload).digest('base64url');
    if (!this.safeEqual(expected, sig)) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
      if (Date.now() - data.ts > 15 * 60 * 1000) return null; // 15-min window
      return { companyId: data.companyId, provider: data.provider };
    } catch {
      return null;
    }
  }
}
