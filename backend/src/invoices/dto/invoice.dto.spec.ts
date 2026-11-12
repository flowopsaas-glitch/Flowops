import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateInvoiceDto, MarkInvoicePaidDto, UpdateInvoiceDto } from './invoice.dto';

/**
 * Invoices.
 *
 * `InvoicesService.create` already refuses to spread caller input — it builds
 * the write from an explicit allowlist and computes its own totals. These tests
 * pin the two properties the DTO adds: nested line items are validated rather
 * than merely present, and a caller cannot supply a total.
 */

/** Mirrors the global pipe: whitelist on, forbidNonWhitelisted off. */
const through = async <T extends object>(cls: new () => T, payload: Record<string, unknown>) => {
  const dto = plainToInstance(cls, payload) as T;
  await validate(dto, { whitelist: true, forbidNonWhitelisted: false });
  return dto;
};

const errorsFor = async (obj: object) => (await validate(obj)).map((e) => e.property);

describe('create', () => {
  it('accepts an invoice with one line', async () => {
    const dto = await through(CreateInvoiceDto, {
      clientName: 'Acme Freight',
      items: [{ description: 'Linehaul JHB → DBN', quantity: 1, unitPrice: 4500 }],
    });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('requires a client name', async () => {
    const dto = await through(CreateInvoiceDto, {
      items: [{ description: 'X', quantity: 1, unitPrice: 1 }],
    });
    expect(await errorsFor(dto)).toContain('clientName');
  });

  it('rejects an invoice with no line items', async () => {
    const dto = await through(CreateInvoiceDto, { clientName: 'Acme', items: [] });
    expect(await errorsFor(dto)).toContain('items');
  });

  it('validates nested line items, not just the array', async () => {
    const dto = await through(CreateInvoiceDto, {
      clientName: 'Acme',
      items: [{ description: 'X', quantity: 0, unitPrice: 1 }],
    });
    const errors = await validate(dto as object);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('strips a caller-supplied total — totals are server-authoritative', async () => {
    const dto = (await through(CreateInvoiceDto, {
      clientName: 'Acme',
      items: [{ description: 'X', quantity: 1, unitPrice: 100, lineTotal: 1, total: 1, tax: 1 }],
    })) as unknown as { items: Array<Record<string, unknown>> };
    expect(dto.items[0].lineTotal).toBeUndefined();
    expect(dto.items[0].total).toBeUndefined();
    expect(dto.items[0].tax).toBeUndefined();
  });

  it('strips server-owned fields from the envelope too', async () => {
    const dto = (await through(CreateInvoiceDto, {
      clientName: 'Acme',
      items: [{ description: 'X', quantity: 1, unitPrice: 1 }],
      status: 'PAID',
      paidAt: '2020-01-01T00:00:00Z',
      publicToken: 'guessed',
      invoiceNumber: 'INV-0001',
      companyId: 'other-tenant',
    })) as unknown as Record<string, unknown>;
    for (const k of ['status', 'paidAt', 'publicToken', 'invoiceNumber', 'companyId']) {
      expect(dto[k]).toBeUndefined();
    }
  });
});

describe('update — only SENT is writable', () => {
  it('accepts SENT', async () => {
    const dto = await through(UpdateInvoiceDto, { status: 'SENT' });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('rejects PAID, which must go through the payment approval flow', async () => {
    // The service guards this too. Rejecting it at the pipe means the response
    // names the field instead of throwing from three layers down.
    const dto = await through(UpdateInvoiceDto, { status: 'PAID' });
    expect(await errorsFor(dto)).toContain('status');
  });

  it('rejects DRAFT', async () => {
    const dto = await through(UpdateInvoiceDto, { status: 'DRAFT' });
    expect(await errorsFor(dto)).toContain('status');
  });
});

describe('markPaid', () => {
  it('accepts an empty body — the amount defaults to the invoice total', async () => {
    const dto = await through(MarkInvoicePaidDto, {});
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('accepts an explicit amount', async () => {
    const dto = await through(MarkInvoicePaidDto, { amount: 4500, paidBy: 'Jane' });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('rejects a negative amount', async () => {
    // A R10 payment must not be able to mark a R10,000 invoice fully PAID.
    const dto = await through(MarkInvoicePaidDto, { amount: -4500 });
    expect(await errorsFor(dto)).toContain('amount');
  });
});
