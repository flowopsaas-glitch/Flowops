import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateClientDto {
  name: string;
  tradingName?: string;
  phone?: string;
  email?: string;
  address?: string;
  billingType?: 'COD' | 'PREPAID' | 'CONTRACT' | 'CASH';
  creditLimit?: number;
  paymentTerms?: number;
  vatNumber?: string;
  accountCode?: string;
  contractStart?: string;
  contractEnd?: string;
  notes?: string;
}

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(companyId: string, billingType?: string) {
    return this.prisma.client.findMany({
      where: {
        companyId,
        isActive: true,
        ...(billingType ? { billingType: billingType as any } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const c = await this.prisma.client.findFirst({ where: { id, companyId } });
    if (!c) throw new NotFoundException('Client not found');
    return c;
  }

  create(companyId: string, dto: CreateClientDto) {
    return this.prisma.client.create({
      data: {
        companyId,
        name: dto.name,
        tradingName: dto.tradingName,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        billingType: (dto.billingType as any) ?? 'COD',
        creditLimit: dto.creditLimit,
        paymentTerms: dto.paymentTerms,
        vatNumber: dto.vatNumber,
        accountCode: dto.accountCode,
        contractStart: dto.contractStart ? new Date(dto.contractStart) : undefined,
        contractEnd: dto.contractEnd ? new Date(dto.contractEnd) : undefined,
        notes: dto.notes,
      },
    });
  }

  async update(id: string, companyId: string, dto: Partial<CreateClientDto>) {
    await this.findOne(id, companyId);
    return this.prisma.client.update({
      where: { id },
      data: {
        ...dto,
        billingType: dto.billingType as any,
        contractStart: dto.contractStart ? new Date(dto.contractStart) : undefined,
        contractEnd: dto.contractEnd ? new Date(dto.contractEnd) : undefined,
      },
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    // Soft delete — preserves waybill history
    return this.prisma.client.update({ where: { id }, data: { isActive: false } });
  }

  /**
   * Client portfolio intelligence — a directory-level roll-up for the Clients
   * page: billing-type mix, contract credit exposure, new-this-month growth and
   * a contract-renewal watch list (contracts expiring soon or lapsed but still
   * active). Pure read of the client directory; no fragile revenue joins (the
   * Finance dashboard owns invoice-based per-client revenue).
   */
  async overview(companyId: string) {
    const now = new Date();
    const in60 = new Date(now.getTime() + 60 * 86_400_000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const clients = await this.prisma.client.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true, name: true, billingType: true, creditLimit: true,
        paymentTerms: true, contractEnd: true, createdAt: true,
      },
    });

    const byBillingType = { COD: 0, PREPAID: 0, CONTRACT: 0, CASH: 0 };
    let totalCreditExtended = 0;
    let newThisMonth = 0;
    let contractTermsSum = 0;
    let contractTermsCount = 0;
    const expiring: { id: string; name: string; contractEnd: string; daysToEnd: number; expired: boolean }[] = [];

    for (const c of clients) {
      const bt = (c.billingType as keyof typeof byBillingType) ?? 'COD';
      if (bt in byBillingType) byBillingType[bt] += 1;
      if (c.creditLimit) totalCreditExtended += c.creditLimit;
      if (c.createdAt >= monthStart) newThisMonth += 1;
      if (bt === 'CONTRACT' && c.paymentTerms != null) { contractTermsSum += c.paymentTerms; contractTermsCount += 1; }
      if (bt === 'CONTRACT' && c.contractEnd && new Date(c.contractEnd) <= in60) {
        const end = new Date(c.contractEnd);
        const daysToEnd = Math.round((end.getTime() - now.getTime()) / 86_400_000);
        expiring.push({ id: c.id, name: c.name, contractEnd: end.toISOString(), daysToEnd, expired: daysToEnd < 0 });
      }
    }
    expiring.sort((a, b) => a.daysToEnd - b.daysToEnd);

    return {
      total: clients.length,
      byBillingType,
      contractCount: byBillingType.CONTRACT,
      totalCreditExtended: Math.round(totalCreditExtended),
      newThisMonth,
      avgContractTerms: contractTermsCount ? Math.round(contractTermsSum / contractTermsCount) : null,
      expiringContracts: expiring.slice(0, 10),
      expiringCount: expiring.length,
      note:
        'Portfolio roll-up of active clients in your directory. Credit extended sums captured credit limits; the renewal watch lists contracts ending within 60 days (or already lapsed while still active).',
    };
  }
}
