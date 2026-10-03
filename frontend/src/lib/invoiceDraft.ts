/**
 * What the Invoice Drafts list shows for a draft.
 *
 * `GET /invoice-drafts` returns raw `InvoiceDraft` rows — `{ id, title, draftData, aiAnalysis, finalized, … }` — where the
 * client, the lines and the amounts live inside the `draftData` JSON. The list page, however, was written against a flat shape
 * (`clientName`, `total`, `status`, `lineCount`, `periodKey`), so a draft such as the rail tariff's would have shown as
 * "FlowOps Client … R0.00" with no status. This derives the flat fields from the JSON, and leaves any that are already flat alone.
 *
 * The value is the sum of the lines BEFORE VAT: finalising the draft (`InvoicesService.create`) adds VAT on top.
 */

export interface DraftView {
  clientName: string | null;
  periodKey: string;
  status: "DRAFT" | "FINALIZED" | string;
  /** Sum of the lines, before VAT. */
  total: number;
  lineCount: number;
}

type Loose = Record<string, unknown>;
const isObj = (v: unknown): v is Loose => !!v && typeof v === "object";
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const cents = (n: number) => Math.round(n * 100) / 100;

export function describeDraft(d: unknown): DraftView {
  const row: Loose = isObj(d) ? d : {};
  const data: Loose = isObj(row.draftData) ? row.draftData : {};
  const items: unknown[] = Array.isArray(data.items) ? data.items : [];

  const derivedTotal = cents(items.reduce<number>((sum, item) => {
    const it: Loose = isObj(item) ? item : {};
    const qty = Math.max(0, Number(it.quantity) || 0);
    const price = Math.max(0, Number(it.unitPrice) || 0);
    return sum + cents(qty * price);
  }, 0));

  return {
    clientName: text(row.clientName) ?? text(data.clientName),
    periodKey: text(row.periodKey) ?? (typeof row.title === "string" ? row.title : ""),
    status: text(row.status) ?? (row.finalized ? "FINALIZED" : "DRAFT"),
    total: finite(row.total) ? row.total : derivedTotal,
    lineCount: finite(row.lineCount) ? row.lineCount : items.length,
  };
}
