import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100; // 🚀 FIXED
}

@Injectable()
export class MonthlyInvoicingService {
  constructor(private readonly prisma: PrismaService) {}

  async generateMonthlyInvoice(params: { buyerCompanyId: number; sellerCompanyId: number; month?: string; vatRate?: number; }) {
    const vatRate = params.vatRate ?? 0.15;
    const invoice = await (this.prisma as any).invoice.create({
        data: {
          invoiceNumber: `INV-${Date.now()}`,
          companyId: params.buyerCompanyId,
          status: 'SENT',
          vatRate,
        }
    });

    const items = await (this.prisma as any).invoiceItem.findMany({ where: { invoiceId: invoice.id } });

    // 🚀 FIXED: reduce syntax and math
    const subtotal = round2(items.reduce((acc: number, it: any) => acc + (it.amountCents || 0), 0) / 100);
    const vatAmount = round2(subtotal * vatRate);
    const total = round2(subtotal + vatAmount);

    await (this.prisma as any).invoice.update({
      where: { id: invoice.id },
      data: { subtotal, vatRate, vatAmount, total },
    });

    return { success: true, total };
  }

  private parseMonth(ym: string): Date { return new Date(); }
  private async nextInvoiceNumber(month: string): Promise<string> { return `INV-${month}-0001`; }
  private async priceCollectionCents(collectionId: number): Promise<number> { return 0; }
}
