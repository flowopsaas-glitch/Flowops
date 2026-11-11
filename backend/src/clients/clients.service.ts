import { Injectable, NotFoundException } from '@nestjs/common';
import {
  IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { pickAllowed } from '../common/pick-allowed.util';

/**
 * These were a TypeScript `interface`, which is erased at compile time. The
 * emitted parameter type is therefore `Object`, and Nest's ValidationPipe skips
 * validation for anything that is not a class — so no `whitelist` stripping and
 * no type checking ever ran on this body. `update` spread it straight into
 * Prisma. Real classes so the pipe can actually see them.
 */
export const ClientBillingTypes = {
  COD: 'COD', PREPAID: 'PREPAID', CONTRACT: 'CONTRACT', CASH: 'CASH',
} as const;
export type ClientBillingTypeValue = (typeof ClientBillingTypes)[keyof typeof ClientBillingTypes];

const BILLING = [
  'tradingName', 'phone', 'email', 'address', 'vatNumber', 'accountCode',
] as const;

export class CreateClientDto {
  @IsString() name: string;
  @IsOptional() @IsString() tradingName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsEnum(ClientBillingTypes) billingType?: ClientBillingTypeValue;
  @IsOptional() @IsNumber() creditLimit?: number;
  @IsOptional() @IsInt() paymentTerms?: number;
  @IsOptional() @IsString() vatNumber?: string;
  @IsOptional() @IsString() accountCode?: string;
  @IsOptional() @IsDateString() contractStart?: string;
  @IsOptional() @IsDateString() contractEnd?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateClientDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() tradingName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsEnum(ClientBillingTypes) billingType?: ClientBillingTypeValue;
  @IsOptional() @IsNumber() creditLimit?: number;
  @IsOptional() @IsInt() paymentTerms?: number;
  @IsOptional() @IsString() vatNumber?: string;
  @IsOptional() @IsString() accountCode?: string;
  @IsOptional() @IsDateString() contractStart?: string;
  @IsOptional() @IsDateString() contractEnd?: string;
  @IsOptional() @IsString() notes?: string;
}

/** Client-writable Client fields (excludes id/companyId/isActive/timestamps). */
const CLIENT_FIELDS = [
  'name', ...BILLING, 'billingType', 'creditLimit', 'paymentTerms',
  'contractStart', 'contractEnd', 'notes',
] as const;
void IsBoolean;

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

  async update(id: string, companyId: string, dto: UpdateClientDto) {
    await this.findOne(id, companyId);
    // Whitelist what a client may write. The DTO was an interface, so the
    // ValidationPipe never saw it and `...dto` carried the raw body into
    // Prisma — including `companyId`, which nothing overwrote afterwards, so a
    // PATCH could move this client record into another company's directory.
    const data: any = pickAllowed(dto, CLIENT_FIELDS);
    if (typeof dto.contractStart === 'string') data.contractStart = new Date(dto.contractStart);
    if (typeof dto.contractEnd === 'string') data.contractEnd = new Date(dto.contractEnd);
    return this.prisma.client.update({ where: { id }, data });
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
