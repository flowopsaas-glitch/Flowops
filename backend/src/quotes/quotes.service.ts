import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QuotesService {
  constructor(private prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.quote.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async create(companyId: string, dto: { fromAddress: string; toAddress: string; weight: number; clientName?: string }) {
    // Simple pricing calculation — replace with rate-card lookup in production
    const basePrice = 80;
    const pricePerKg = 15;
    const price = basePrice + pricePerKg * (dto.weight || 1);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    return this.prisma.quote.create({
      data: {
        fromAddress: dto.fromAddress,
        toAddress:   dto.toAddress,
        weight:      dto.weight,
        clientName:  dto.clientName ?? null,
        price,
        expiresAt,
        companyId,
        breakdown: { base: basePrice, perKg: pricePerKg * dto.weight, total: price },
      },
    });
  }

  async accept(id: string, companyId: string) {
    // Tenant-scoped: only accept a quote belonging to the caller's company.
    const res = await this.prisma.quote.updateMany({
      where: { id, companyId },
      data: { accepted: true },
    });
    if (res.count === 0) throw new NotFoundException('Quote not found');
    return this.prisma.quote.findFirst({ where: { id, companyId } });
  }

  /**
   * Quote conversion / pipeline analytics. A quote is WON when accepted, LOST
   * when it expired un-accepted, and OPEN (pipeline) while still live. Win rate
   * is measured over decided quotes only (won + lost) so undecided pipeline
   * doesn't dilute it. All values are the quoted price, tenant-scoped.
   */
  async metrics(companyId: string) {
    const now = new Date();
    const quotes = await this.prisma.quote.findMany({
      where: { companyId },
      select: { price: true, accepted: true, expiresAt: true },
    });

    let accepted = 0, pending = 0, expired = 0;
    let wonValue = 0, pipelineValue = 0, lostValue = 0, totalValue = 0;

    for (const q of quotes) {
      const price = q.price || 0;
      totalValue += price;
      if (q.accepted) { accepted++; wonValue += price; }
      else if (q.expiresAt && new Date(q.expiresAt) < now) { expired++; lostValue += price; }
      else { pending++; pipelineValue += price; }
    }

    const total = quotes.length;
    const decided = accepted + expired;
    const round = (n: number) => Math.round(n);
    const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

    return {
      total,
      accepted,
      pending,
      expired,
      winRatePct: pct(accepted, decided),       // of decided quotes
      acceptRatePct: pct(accepted, total),       // of all quotes
      wonValue: round(wonValue),
      pipelineValue: round(pipelineValue),
      lostValue: round(lostValue),
      totalValue: round(totalValue),
      avgQuoteValue: total > 0 ? round(totalValue / total) : 0,
      avgWonValue: accepted > 0 ? round(wonValue / accepted) : 0,
      note:
        'Win rate is won quotes over decided quotes (won + expired); open pipeline is excluded. Values are the quoted price.',
    };
  }
}
