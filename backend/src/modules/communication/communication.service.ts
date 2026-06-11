// @ts-nocheck
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CommSource } from '@prisma/client';

@Injectable()
export class CommunicationService {
  private readonly logger = new Logger(CommunicationService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Records a message and calculates tenant billing based on Company rates
   */
  async logMessage(data: {
    companyId: number;
    content: string;
    source: 'WHATSAPP' | 'EMAIL';
    direction: 'INBOUND' | 'OUTBOUND';
    status: string;
  }) {
    const company = await this.prisma.company.findUnique({
      where: { id: data.companyId },
      select: { pricePerWhatsapp: true, pricePerEmail: true },
    });

    if (!company) {
      this.logger.error(`Tenant billing failed: Company ${data.companyId} not found.`);
      return;
    }

    // Use DB rates or fall back to standard South African rates (0.80 for WA, 0.10 for Email)
    const rate = data.source === 'WHATSAPP' 
      ? (company.pricePerWhatsapp || 0.80) 
      : (company.pricePerEmail || 0.10);

    return this.prisma.communication.create({
      data: {
        content: data.content,
        source: data.source as CommSource,
        direction: data.direction,
        status: data.status,
        companyId: data.companyId,
        billedAmount: rate,
        // messagePrice removed // Your internal overhead
      },
    });
  }

  /**
   * Multi-tenant routing: Find which company owns this phone number
   */
  async identifyTenant(phoneNumber: string): Promise<number> {
    // Search active waybills for a phone match
    const waybill = await this.prisma.waybill.findFirst({
      where: {
        OR: [
          { phone: phoneNumber },
          { consigneePhone: phoneNumber },
          { shipperPhone: phoneNumber },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { companyId: true },
    });

    if (waybill) return waybill.companyId;

    // Fallback to Master Admin (ID 1) if it's a new lead
    return 1;
  }
}
