import { describe, expect, it } from 'vitest';
import { buildInvoiceCreatePayload } from './invoiceCreatePayload';

describe('buildInvoiceCreatePayload', () => {
  it('keeps only server-supported invoice fields and links batch deliveries by waybill ID', () => {
    const payload = buildInvoiceCreatePayload({
      clientName: '  Acme Logistics  ',
      clientEmail: ' billing@acme.example ',
      dueDate: '2026-11-01',
      notes: '  Net 30  ',
      items: [
        {
          description: ' Delivery WB-123 to A. Client ',
          quantity: 1,
          unitPrice: 125.5,
          waybillId: ' waybill-123 ',
          // UI-only values must not become trusted API fields.
          total: 999,
        } as any,
      ],
      // Totals and status are intentionally not part of the input contract.
      subtotal: 999,
      tax: 999,
      total: 1998,
      status: 'PAID',
      companyId: 'untrusted-company',
    } as any);

    expect(payload).toEqual({
      clientName: 'Acme Logistics',
      clientEmail: 'billing@acme.example',
      dueDate: '2026-11-01',
      notes: 'Net 30',
      items: [{
        description: 'Delivery WB-123 to A. Client',
        quantity: 1,
        unitPrice: 125.5,
        waybillId: 'waybill-123',
      }],
    });
  });

  it('omits blank optional fields and does not send client-calculated totals', () => {
    const payload = buildInvoiceCreatePayload({
      clientName: ' Acme ',
      clientEmail: ' ',
      dueDate: '',
      notes: '  ',
      items: [{ description: 'Manual service', quantity: 2, unitPrice: 100, total: 200 } as any],
    });

    expect(payload).toEqual({
      clientName: 'Acme',
      items: [{ description: 'Manual service', quantity: 2, unitPrice: 100 }],
    });
    expect(payload).not.toHaveProperty('subtotal');
    expect(payload).not.toHaveProperty('tax');
    expect(payload).not.toHaveProperty('total');
  });
});
