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
}
