import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateClientDto {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  billingType?: string; // PREPAID, CONTRACT, CODE
  accountCode?: string;
  creditLimit?: number;
}

@Injectable()
export class ClientsService {
  private readonly logger = new Logger('ClientsService');

  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: number) {
    return this.prisma.client.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async create(companyId: number, dto: CreateClientDto) {
    if (!dto.name?.trim()) throw new BadRequestException('Client name is required');

    const billingType = (dto.billingType || 'PREPAID').toUpperCase();
    if (!['PREPAID', 'CONTRACT', 'COD'].includes(billingType)) {
      throw new BadRequestException('Billing type must be PREPAID, CONTRACT, or COD');
    }

    const client = await this.prisma.client.create({
      data: {
        name: dto.name.trim(),
        email: dto.email?.trim() || null,
        phone: dto.phone?.trim() || null,
        address: dto.address?.trim() || null,
        billingType,
        accountCode: dto.accountCode?.trim() || null,
        creditLimit: dto.creditLimit ?? 0,
        companyId,
      },
    });
    this.logger.log(`Created client "${client.name}" (${billingType}) for company ${companyId}`);
    return client;
  }

  async update(id: number, companyId: number, dto: Partial<CreateClientDto>) {
    const existing = await this.prisma.client.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Client not found');

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.email !== undefined) data.email = dto.email?.trim() || null;
    if (dto.phone !== undefined) data.phone = dto.phone?.trim() || null;
    if (dto.address !== undefined) data.address = dto.address?.trim() || null;
    if (dto.billingType !== undefined) data.billingType = dto.billingType.toUpperCase();
    if (dto.accountCode !== undefined) data.accountCode = dto.accountCode?.trim() || null;
    if (dto.creditLimit !== undefined) data.creditLimit = dto.creditLimit;

    return this.prisma.client.update({ where: { id }, data });
  }

  async remove(id: number, companyId: number) {
    const existing = await this.prisma.client.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Client not found');
    await this.prisma.client.delete({ where: { id } });
    return { success: true, message: 'Client removed' };
  }
}
