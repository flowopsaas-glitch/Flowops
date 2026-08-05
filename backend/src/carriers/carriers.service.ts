import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Carrier & Procurement (buy-side): the shipping lines, airlines, road carriers
 * and broker/vendor partners a forwarder books space with, plus their negotiated
 * buy-rates. Distinct from the sell-side RateCard. Everything is strictly scoped
 * to the caller's companyId.
 */
@Injectable()
export class CarriersService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string, query?: { type?: string; active?: string; q?: string }) {
    const where: any = { companyId };
    if (query?.type) where.type = query.type;
    if (query?.active === 'true') where.isActive = true;
    if (query?.active === 'false') where.isActive = false;
    if (query?.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { code: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.carrier.findMany({
      where,
      include: { rates: { orderBy: { createdAt: 'desc' } } },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      take: 500,
    });
  }

  async get(companyId: string, id: string) {
    const carrier = await this.prisma.carrier.findFirst({
      where: { id, companyId },
      include: { rates: { orderBy: { createdAt: 'desc' } } },
    });
    if (!carrier) throw new NotFoundException('Carrier not found');
    return carrier;
  }

  create(companyId: string, dto: any) {
    return this.prisma.carrier.create({
      data: {
        companyId,
        name: dto.name,
        type: dto.type ?? 'OTHER',
        code: dto.code ?? null,
        contactName: dto.contactName ?? null,
        contactEmail: dto.contactEmail ?? null,
        contactPhone: dto.contactPhone ?? null,
        accountNumber: dto.accountNumber ?? null,
        notes: dto.notes ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(companyId: string, id: string, dto: any) {
    await this.get(companyId, id);
    const { id: _omit, companyId: _omit2, rates: _omit3, ...data } = dto ?? {};
    return this.prisma.carrier.update({ where: { id }, data });
  }

  async remove(companyId: string, id: string) {
    await this.get(companyId, id);
    await this.prisma.carrier.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Buy-rate contracts ──────────────────────────────────────────────────

  async addRate(companyId: string, carrierId: string, dto: any) {
    await this.get(companyId, carrierId); // tenant-scope guard
    return this.prisma.carrierRate.create({
      data: {
        carrierId,
        companyId,
        lane: dto.lane ?? null,
        mode: dto.mode ?? null,
        containerType: dto.containerType ?? null,
        buyRate: Number(dto.buyRate ?? 0),
        currency: dto.currency ?? 'USD',
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validTo: dto.validTo ? new Date(dto.validTo) : null,
      },
    });
  }

  async removeRate(companyId: string, carrierId: string, rateId: string) {
    await this.get(companyId, carrierId);
    const rate = await this.prisma.carrierRate.findFirst({ where: { id: rateId, carrierId, companyId } });
    if (!rate) throw new NotFoundException('Rate not found');
    await this.prisma.carrierRate.delete({ where: { id: rateId } });
    return { deleted: true };
  }

  async metrics(companyId: string) {
    const [total, active, rates] = await Promise.all([
      this.prisma.carrier.count({ where: { companyId } }),
      this.prisma.carrier.count({ where: { companyId, isActive: true } }),
      this.prisma.carrierRate.count({ where: { companyId } }),
    ]);
    return { total, active, rates };
  }

  /** Normalise a lane string so "CNSHA → ZADUR", "cnsha->zadur" group together. */
  private normaliseLane(lane?: string | null): string {
    if (!lane) return '';
    return lane
      .toUpperCase()
      .replace(/[-=]+>|→|➔|»|>/g, '→') // unify any arrow form
      .replace(/\s+/g, ' ')
      .replace(/\s*→\s*/g, ' → ')
      .trim();
  }

  /**
   * Lane Rate Explorer — buy-side benchmarking.
   *
   * Groups every captured buy-rate by lane + container type + currency (never
   * across currencies — that would be a false comparison) and surfaces, per
   * lane, the cheapest carrier, the spread, the average, how many carriers quote
   * it, and the saving available vs the most expensive option. This is the
   * "where am I leaving money on the table?" view a procurement desk lives in.
   */
  async laneAnalysis(companyId: string) {
    const rates = await this.prisma.carrierRate.findMany({
      where: { companyId, lane: { not: null } },
      include: { carrier: { select: { id: true, name: true, type: true, isActive: true } } },
    });

    type Row = {
      lane: string; containerType: string | null; mode: string | null; currency: string;
      quotes: { carrierId: string; carrierName: string; buyRate: number; rateId: string; active: boolean }[];
    };
    const groups = new Map<string, Row>();

    for (const r of rates) {
      const lane = this.normaliseLane(r.lane);
      if (!lane) continue;
      const ct = (r.containerType || '').toUpperCase().trim() || null;
      const currency = (r.currency || 'USD').toUpperCase();
      const key = `${lane}|${ct ?? ''}|${currency}`;
      if (!groups.has(key)) {
        groups.set(key, { lane, containerType: ct, mode: r.mode ?? null, currency, quotes: [] });
      }
      groups.get(key)!.quotes.push({
        carrierId: r.carrierId,
        carrierName: r.carrier?.name ?? 'Unknown carrier',
        buyRate: r.buyRate,
        rateId: r.id,
        active: r.carrier?.isActive ?? true,
      });
    }

    const lanes = [...groups.values()].map((g) => {
      const sorted = [...g.quotes].sort((a, b) => a.buyRate - b.buyRate);
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      const distinctCarriers = new Set(g.quotes.map((q) => q.carrierId)).size;
      const sum = g.quotes.reduce((s, q) => s + q.buyRate, 0);
      const avg = g.quotes.length ? sum / g.quotes.length : 0;
      const savings = +(worst.buyRate - best.buyRate).toFixed(2);
      const savingsPct = worst.buyRate > 0 ? +((savings / worst.buyRate) * 100).toFixed(1) : 0;
      return {
        lane: g.lane,
        containerType: g.containerType,
        mode: g.mode,
        currency: g.currency,
        carrierCount: distinctCarriers,
        quoteCount: g.quotes.length,
        best: { carrierId: best.carrierId, carrierName: best.carrierName, buyRate: +best.buyRate.toFixed(2), active: best.active },
        worstRate: +worst.buyRate.toFixed(2),
        avgRate: +avg.toFixed(2),
        savings,
        savingsPct,
        quotes: sorted.map((q) => ({ ...q, buyRate: +q.buyRate.toFixed(2) })),
      };
    });

    // Most actionable first: lanes with real competition + biggest savings.
    lanes.sort((a, b) => (b.carrierCount - a.carrierCount) || (b.savings - a.savings));

    const competitive = lanes.filter((l) => l.carrierCount > 1);
    const soleSource = lanes.filter((l) => l.carrierCount === 1);
    const totalSavings = competitive.reduce(
      (acc, l) => {
        acc[l.currency] = +((acc[l.currency] ?? 0) + l.savings).toFixed(2);
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      lanes,
      summary: {
        lanes: lanes.length,
        competitiveLanes: competitive.length,
        soleSourceLanes: soleSource.length,
        totalSavings, // per-currency map; never summed across currencies
      },
      note:
        'Buy-rates are grouped by lane, container type and currency — comparisons are never made across currencies. "Saving available" is the gap between the cheapest and most expensive quote you captured for the same lane.',
    };
  }
}
