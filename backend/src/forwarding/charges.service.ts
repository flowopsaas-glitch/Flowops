import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChargesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertFile(companyId: string, fileId: string) {
    const f = await this.prisma.shipmentFile.findFirst({ where: { id: fileId, companyId }, select: { id: true, fileNumber: true, consigneeName: true } });
    if (!f) throw new NotFoundException('Shipment file not found');
    return f;
  }

  /**
   * Charges hang off a file and carry no companyId of their own, so tenant
   * scope is asserted through the file relation rather than left to the
   * assertFile() call that preceded it. Application-level scoping is the only
   * scoping that is active today; a transitive guarantee is one refactor away
   * from becoming none.
   */
  private chargesFor(companyId: string, fileId: string) {
    return this.prisma.shipmentCharge.findMany({ where: { fileId, file: { companyId } } });
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

  /** Returns whether the charge existed. A missing charge is not a deletion. */
  async removeCharge(companyId: string, fileId: string, chargeId: string) {
    await this.assertFile(companyId, fileId);
    const { count } = await this.prisma.shipmentCharge.deleteMany({
      where: { id: chargeId, fileId, file: { companyId } },
    });
    if (count === 0) throw new NotFoundException('Charge not found on this file');
    return { deleted: true };
  }

  /** Per-currency cost / sell / margin totals + overall margin %. */
  async totals(companyId: string, fileId: string) {
    await this.assertFile(companyId, fileId);
    const charges = await this.chargesFor(companyId, fileId);
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
    const invoiceNumber = `${file.fileNumber}-INV`;

    return this.prisma.$transaction(async (tx: any) => {
      // Share the invoice-sequence lock with ordinary and monthly invoice
      // creation. The file-derived number remains stable, and the lookup makes
      // retries idempotent after a successful first request.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(641902, hashtext(${companyId}))`;

      // Read the charges under the lock, not before it. A charge added between
      // an earlier read and this point would otherwise be missing from the
      // total of an invoice the caller believes is complete.
      const charges = await tx.shipmentCharge.findMany({ where: { fileId, file: { companyId } } });
      if (charges.length === 0) throw new NotFoundException('No charges to invoice on this file');

      const existing = await tx.invoice.findFirst({ where: { companyId, invoiceNumber } });
      if (existing) return existing;

      // Line count per currency, so a single-currency file is unaffected.
      const counts: Record<string, number> = {};
      for (const c of charges) counts[c.currency] = (counts[c.currency] || 0) + 1;
      const present = Object.keys(counts);

      // An invoice carries one amount in one currency. This system stores no
      // exchange rate anywhere, so a mixed-currency file cannot be totalled —
      // only guessed. Refusing is the honest outcome: silently dropping the
      // non-primary lines produced a draft that looked complete and under-billed
      // the customer by whatever those lines were worth.
      if (present.length > 1) {
        const detail = present
          .map((cur) => {
            const sell = charges.filter((c) => c.currency === cur).reduce((s, c) => s + c.sell, 0);
            const n = counts[cur];
            return `${cur} ${sell.toFixed(2)} (${n} ${n === 1 ? 'line' : 'lines'})`;
          })
          .sort()
          .join(', ');
        throw new ConflictException(
          `File ${file.fileNumber} has charges in ${present.length} currencies and no exchange rate is stored: ${detail}. ` +
            `Split the charges into one file per currency, or record a rate, before invoicing.`,
        );
      }

      const primary = present[0];
      const total = charges.reduce((s, c) => s + c.sell, 0);

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
