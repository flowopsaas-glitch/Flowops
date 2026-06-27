import { Injectable, BadRequestException } from '@nestjs/common';
import {
  AccountingProviderAdapter, AccountingDoc, ProviderConnection, PushResult,
} from './types';

/**
 * Sage Pastel Partner/Xpress adapter. Pastel desktop has no live API, so this
 * "push" appends the document to a Pastel-compatible import file the bookkeeper
 * imports (Process → Import/Export). We return a deterministic external id so the
 * sync log + reconciliation still work. The actual CSV is produced on demand by
 * the service's exportPastel().
 */
@Injectable()
export class PastelProvider implements AccountingProviderAdapter {
  readonly key = 'PASTEL' as const;
  readonly name = 'Sage Pastel (Partner/Xpress)';
  readonly usesOAuth = false;

  isConfigured(): boolean {
    return true; // file-based — always available
  }

  async pushInvoice(_conn: ProviderConnection, doc: AccountingDoc): Promise<PushResult> {
    // Marked synced into the Pastel import batch; the file is downloaded separately.
    return { externalId: `PASTEL-INV-${doc.number}` };
  }

  async pushCreditNote(_conn: ProviderConnection, doc: AccountingDoc): Promise<PushResult> {
    return { externalId: `PASTEL-CN-${doc.number}` };
  }

  /**
   * Build a Pastel Partner customer-document import file. Columns follow Pastel's
   * "Customer Invoices/Credit Notes" import layout (header + detail lines).
   */
  static buildImportCsv(docs: { doc: AccountingDoc; isCredit: boolean }[]): string {
    if (!docs.length) throw new BadRequestException('No documents to export');
    const esc = (v: string | number) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = [
      'DocType', 'DocNumber', 'AccountCode', 'CustomerName', 'Date', 'DueDate',
      'LineDescription', 'Quantity', 'UnitExclPrice', 'TaxType', 'LineExcl', 'DocTotalIncl',
    ];
    const rows: (string | number)[][] = [];
    for (const { doc, isCredit } of docs) {
      const type = isCredit ? 'CN' : 'INV';
      for (const l of doc.lineItems) {
        rows.push([
          type, doc.number, '', doc.clientName,
          new Date(doc.date).toISOString().slice(0, 10),
          doc.dueDate ? new Date(doc.dueDate).toISOString().slice(0, 10) : '',
          l.description, l.quantity, l.unitAmount, '01', round2(l.quantity * l.unitAmount),
          round2(doc.total),
        ]);
      }
    }
    return [headers.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n');
  }
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
