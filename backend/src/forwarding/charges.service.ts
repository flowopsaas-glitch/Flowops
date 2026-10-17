import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChargesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertFile(companyId: string, fileId: string) {
    const f = await this.prisma.shipmentFile.findFirst({ where: { id: fileId, companyId }, select: { id: true, fileNumber: true, consigneeName: true } });
    if (!f) throw new NotFoundException('Shipment file not found');
    return f;
  }

  async addCharge(
    companyId: string,
    fileId: string,
    dto: { description: string; currency?: string; cost?: number; sell?: number; invoiceTo?: string },
  ) {
    await this.assertFile(companyId, fileId);
    return this.prisma.shipmentCharge.create({
      data: {
        fileId,
        description: dto.description,
        currency: (dto.currency || 'ZAR').toUpperCase(),
        cost: dto.cost ?? 0,
        sell: dto.sell ?? 0,
        invoiceTo: dto.invoiceTo ?? null,
      },
    });
  }

  async removeCharge(companyId: string, fileId: string, chargeId: string) {
    await this.assertFile(companyId, fileId);
    await this.prisma.shipmentCharge.deleteMany({ where: { id: chargeId, fileId } });
    return { deleted: true };
  }

  /** Per-currency cost / sell / margin totals + overall margin %. */
  async totals(companyId: string, fileId: string) {
    await this.assertFile(companyId, fileId);
    const charges = await this.prisma.shipmentCharge.findMany({ where: { fileId } });
    const byCurrency: Record<string, { currency: string; cost: number; sell: number; margin: number; marginPct: number }> = {};
    for (const c of charges) {
      const cur = c.currency || 'ZAR';
      const bucket = byCurrency[cur] || (byCurrency[cur] = { currency: cur, cost: 0, sell: 0, margin: 0, marginPct: 0 });
      bucket.cost += c.cost;
      bucket.sell += c.sell;
    }
    for (const b of Object.values(byCurrency)) {
      b.margin = +(b.sell - b.cost).toFixed(2);
      b.marginPct = b.sell > 0 ? +((b.margin / b.sell) * 100).toFixed(1) : 0;
      b.cost = +b.cost.toFixed(2);
      b.sell = +b.sell.toFixed(2);
    }
    return { currencies: Object.values(byCurrency), chargeCount: charges.length };
  }

  /**
   * Generate a DRAFT invoice from the file's sell charges (operator finalises
   * it in the Invoices module). Reuses the existing Invoice table.
   */
  async generateInvoice(companyId: string, fileId: string) {
    const file = await this.assertFile(companyId, fileId);
    const charges = await this.prisma.shipmentCharge.findMany({ where: { fileId } });
    if (charges.length === 0) throw new NotFoundException('No charges to invoice on this file');

    // Primary currency = the one with the most charge lines.
    const counts: Record<string, number> = {};
    for (const c of charges) counts[c.currency] = (counts[c.currency] || 0) + 1;
    const primary = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const total = charges.filter((c) => c.currency === primary).reduce((s, c) => s + c.sell, 0);

    const invoiceNumber = `${file.fileNumber}-INV`;
    return this.prisma.$transaction(async (tx: any) => {
      // Share the invoice-sequence lock with ordinary and monthly invoice
      // creation. The file-derived number remains stable, and the lookup makes
      // retries idempotent after a successful first request.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(641902, hashtext(${companyId}))`;
      const existing = await tx.invoice.findFirst({ where: { companyId, invoiceNumber } });
      if (existing) return existing;

      return tx.invoice.create({
        data: {
          invoiceNumber,
          clientName: charges.find((c) => c.invoiceTo)?.invoiceTo || file.consigneeName || 'Consignee',
          subtotal: +total.toFixed(2),
          tax: 0,
          total: +total.toFixed(2),
          notes: `Generated from forwarding file ${file.fileNumber} (${primary}).`,
          companyId,
        },
      });
    });
  }
}
