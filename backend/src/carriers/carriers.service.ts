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
}
