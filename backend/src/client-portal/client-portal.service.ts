import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class ClientPortalService {
  private readonly logger = new Logger(ClientPortalService.name);
  private readonly JWT_SECRET = process.env.JWT_SECRET || 'flowops-client-portal-secret-2026';

  constructor(private prisma: PrismaService) {}

  async login(email: string, password: string) {
    const client = await this.prisma.client.findFirst({
      where: { email }
    });

    if (!client) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const company = await this.prisma.company.findUnique({
      where: { id: client.companyId }
    });

    const token = jwt.sign(
      { 
        clientId: client.id, 
        companyId: client.companyId,
        email: client.email 
      },
      this.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return {
      token,
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
        company: company?.name || 'Unknown Company'
      }
    };
  }

  async verifyToken(token: string) {
    try {
      const payload = jwt.verify(token, this.JWT_SECRET) as any;
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  async getClientShipments(clientId: number, companyId: number) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId }
    });
    const email = client?.email || '';

    return this.prisma.waybill.findMany({
      where: {
        companyId: companyId,
        OR: [
          { senderEmail: email },
          { receiverEmail: email }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
  }

  async getClientInvoices(clientId: number, companyId: number) {
    return this.prisma.invoice.findMany({
      where: { companyId },
      include: {
        items: true,
        billingBatch: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async trackWaybill(waybillNumber: string) {
    const waybill = await this.prisma.waybill.findUnique({
      where: { waybillNumber }
    });

    if (!waybill) {
      throw new NotFoundException('Waybill not found');
    }

    return {
      waybillNumber: waybill.waybillNumber,
      status: waybill.status,
      origin: waybill.origin || 'Unknown',
      destination: waybill.destination || 'Unknown',
      recipient: waybill.recipient || 'Unknown',
      createdAt: waybill.createdAt,
      trackingEvents: []
    };
  }
}
