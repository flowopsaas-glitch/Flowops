export type InvoiceCreateLineInput = {
  description: string;
  quantity: number;
  unitPrice: number;
  waybillId?: string;
};

export type InvoiceCreateInput = {
  clientName: string;
  clientEmail?: string;
  dueDate?: string;
  notes?: string;
  taxRate?: number;
  items: InvoiceCreateLineInput[];
};

/**
 * Build the narrow API contract for POST /invoices. Totals and line totals are
 * intentionally omitted: InvoicesService recalculates them, and only linked
 * waybill IDs may influence billing eligibility.
 */
export function buildInvoiceCreatePayload(input: InvoiceCreateInput) {
  const optionalText = (value?: string) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  };

  const clientEmail = optionalText(input.clientEmail);
  const dueDate = optionalText(input.dueDate);
  const notes = optionalText(input.notes);

  return {
    clientName: input.clientName.trim(),
    ...(clientEmail ? { clientEmail } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(notes ? { notes } : {}),
    ...(input.taxRate === undefined ? {} : { taxRate: input.taxRate }),
    items: input.items.map((item) => ({
      description: item.description.trim(),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      ...(item.waybillId?.trim() ? { waybillId: item.waybillId.trim() } : {}),
    })),
  };
}
