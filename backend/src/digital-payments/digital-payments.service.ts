import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { claimTransition } from '../common/state-transition';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto, ConfirmPaymentDto } from './dto/digital-payment.dto';
import { randomBytes } from 'crypto';

@Injectable()
export class DigitalPaymentsService {
  private readonly logger = new Logger(DigitalPaymentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createPayment(companyId: string, dto: CreatePaymentDto) {
    if (dto.amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const reference = `PAY-${randomBytes(6).toString('hex').toUpperCase()}`;

    return this.prisma.digitalPayment.create({
      data: {
        companyId,
        amount: dto.amount,
        currency: dto.currency || 'ZAR',
        method: dto.method,
        status: 'PENDING',
        reference,
        waybillId: dto.waybillId,
        driverId: dto.driverId,
        payerName: dto.payerName,
        payerPhone: dto.payerPhone,
        payerEmail: dto.payerEmail,
        gateway: dto.gateway || 'MANUAL',
      },
    });
  }

  async confirmPayment(companyId: string, dto: ConfirmPaymentDto) {
    const payment = await this.prisma.digitalPayment.findFirst({
      where: { reference: dto.reference, companyId },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === 'SUCCESS') {
      throw new BadRequestException('Payment already confirmed');
    }

    await this.prisma.withTenant(companyId, (tx) =>
      claimTransition(
        () => tx.digitalPayment.updateMany({
          where: { id: payment.id, companyId, status: { not: 'SUCCESS' } },
          data: { status: 'SUCCESS', externalId: dto.externalId, paidAt: new Date() },
        }),
        'Payment was confirmed by someone else.',
      ),
    );
    return this.prisma.digitalPayment.findUniqueOrThrow({ where: { id: payment.id } });
  }

  async failPayment(id: string, companyId: string) {
    const payment = await this.findOne(id, companyId);
    if (payment.status !== 'PENDING' && payment.status !== 'PROCESSING') {
      throw new BadRequestException('Payment cannot be marked as failed');
    }
    await this.prisma.withTenant(companyId, (tx) =>
      claimTransition(
        () => tx.digitalPayment.updateMany({
          where: { id, companyId, status: { in: ['PENDING', 'PROCESSING'] } },
          data: { status: 'FAILED' },
        }),
        'Payment was already resolved by someone else.',
      ),
    );
    return this.prisma.digitalPayment.findUniqueOrThrow({ where: { id } });
  }

  async refundPayment(id: string, companyId: string) {
    const payment = await this.findOne(id, companyId);
    if (payment.status !== 'SUCCESS') {
      throw new BadRequestException('Only successful payments can be refunded');
    }
    // Refunding twice is money out twice. Two callers who both read SUCCESS
    // both pass the check above, so the WHERE is what actually stops it.
    await this.prisma.withTenant(companyId, (tx) =>
      claimTransition(
        () => tx.digitalPayment.updateMany({
          where: { id, companyId, status: 'SUCCESS' },
          data: { status: 'REFUNDED' },
        }),
        'Payment was refunded by someone else.',
      ),
    );
    return this.prisma.digitalPayment.findUniqueOrThrow({ where: { id } });
  }

  async findAll(companyId: string, query?: { status?: string; method?: string; waybillId?: string }) {
    const where: any = { companyId };
    if (query?.status) where.status = query.status;
    if (query?.method) where.method = query.method;
    if (query?.waybillId) where.waybillId = query.waybillId;

    return this.prisma.digitalPayment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const payment = await this.prisma.digitalPayment.findFirst({ where: { id, companyId } });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async findByWaybill(waybillId: string, companyId: string) {
    return this.prisma.digitalPayment.findMany({
      where: { waybillId, companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStats(companyId: string) {
    const [total, pending, successful, failed, refunded] = await Promise.all([
      this.prisma.digitalPayment.count({ where: { companyId } }),
      this.prisma.digitalPayment.count({ where: { companyId, status: 'PENDING' } }),
      this.prisma.digitalPayment.count({ where: { companyId, status: 'SUCCESS' } }),
      this.prisma.digitalPayment.count({ where: { companyId, status: 'FAILED' } }),
      this.prisma.digitalPayment.count({ where: { companyId, status: 'REFUNDED' } }),
    ]);

    const totalRevenue = await this.prisma.digitalPayment.aggregate({
      where: { companyId, status: 'SUCCESS' },
      _sum: { amount: true },
    });

    return {
      total,
      pending,
      successful,
      failed,
      refunded,
      totalRevenue: totalRevenue._sum.amount || 0,
      successRate: total ? Math.round((successful / total) * 100) : 0,
    };
  }
}
