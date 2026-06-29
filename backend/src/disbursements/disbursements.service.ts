import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Disbursements ledger — money a forwarder pays to an authority (SARS, ports,
 * lines) ON BEHALF of a client and later recovers. Tracks paid-out vs recovered
 * with an aging view. Strictly tenant-scoped.
 */
@Injectable()
export class DisbursementsService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string, query?: { status?: string; q?: string }) {
    const where: any = { companyId };
    if (query?.status) where.status = query.status;
    if (query?.q) {
      where.OR = [
        { clientName: { contains: query.q, mode: 'insensitive' } },
        { authority: { contains: query.q, mode: 'insensitive' } },
        { reference: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.disbursement.findMany({
      where,
      orderBy: [{ status: 'asc' }, { paidAt: 'desc' }],
      take: 500,
    });
  }

  async get(companyId: string, id: string) {
    const d = await this.prisma.disbursement.findFirst({ where: { id, companyId } });
    if (!d) throw new NotFoundException('Disbursement not found');
    return d;
  }

  create(companyId: string, dto: any) {
    return this.prisma.disbursement.create({
      data: {
        companyId,
        fileId: dto.fileId ?? null,
        clientName: dto.clientName ?? null,
        authority: dto.authority ?? 'SARS',
        category: dto.category ?? 'DUTY',
        reference: dto.reference ?? null,
        description: dto.description ?? null,
        amount: Number(dto.amount ?? 0),
        currency: dto.currency ?? 'ZAR',
        status: dto.status ?? 'OUTSTANDING',
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
      },
    });
  }

  async update(companyId: string, id: string, dto: any) {
    await this.get(companyId, id);
    const { id: _i, companyId: _c, ...data } = dto ?? {};
    if (data.amount !== undefined) data.amount = Number(data.amount);
    if (data.paidAt) data.paidAt = new Date(data.paidAt);
    return this.prisma.disbursement.update({ where: { id }, data });
  }

  /** Mark a disbursement recovered (client reimbursed us). */
  async markRecovered(companyId: string, id: string, invoiceId?: string) {
    await this.get(companyId, id);
    return this.prisma.disbursement.update({
      where: { id },
      data: { status: 'RECOVERED', recoveredAt: new Date(), invoiceId: invoiceId ?? undefined },
    });
  }

  async setStatus(companyId: string, id: string, status: string) {
    await this.get(companyId, id);
    const allowed = ['OUTSTANDING', 'INVOICED', 'RECOVERED', 'WRITTEN_OFF'];
    if (!allowed.includes(status)) throw new NotFoundException(`Invalid status. Use: ${allowed.join(', ')}`);
    return this.prisma.disbursement.update({
      where: { id },
      data: {
        status: status as any,
        recoveredAt: status === 'RECOVERED' ? new Date() : null,
      },
    });
  }

  async remove(companyId: string, id: string) {
    await this.get(companyId, id);
    await this.prisma.disbursement.delete({ where: { id } });
    return { deleted: true };
  }

  /** Summary + aging of OUTSTANDING/INVOICED (un-recovered) disbursements. */
  async metrics(companyId: string) {
    const now = Date.now();
    const day = 86_400_000;
    const open = await this.prisma.disbursement.findMany({
      where: { companyId, status: { in: ['OUTSTANDING', 'INVOICED'] } },
      select: { amount: true, paidAt: true },
    });
    const [recoveredAgg, writtenAgg, totalCount] = await Promise.all([
      this.prisma.disbursement.aggregate({ where: { companyId, status: 'RECOVERED' }, _sum: { amount: true } }),
      this.prisma.disbursement.aggregate({ where: { companyId, status: 'WRITTEN_OFF' }, _sum: { amount: true } }),
      this.prisma.disbursement.count({ where: { companyId } }),
    ]);

    const buckets = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
    let outstanding = 0;
    for (const d of open) {
      outstanding += d.amount || 0;
      const age = Math.floor((now - new Date(d.paidAt).getTime()) / day);
      if (age <= 30) buckets.d0_30 += d.amount || 0;
      else if (age <= 60) buckets.d31_60 += d.amount || 0;
      else if (age <= 90) buckets.d61_90 += d.amount || 0;
      else buckets.d90plus += d.amount || 0;
    }

    return {
      outstanding: Math.round(outstanding),
      outstandingCount: open.length,
      recovered: Math.round(recoveredAgg._sum.amount ?? 0),
      writtenOff: Math.round(writtenAgg._sum.amount ?? 0),
      total: totalCount,
      aging: {
        d0_30: Math.round(buckets.d0_30),
        d31_60: Math.round(buckets.d31_60),
        d61_90: Math.round(buckets.d61_90),
        d90plus: Math.round(buckets.d90plus),
      },
    };
  }
}
