import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { claimTransition } from '../common/state-transition';
import { Money } from '../common/money.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto, ConfirmPaymentDto } from './dto/digital-payment.dto';
import { randomBytes } from 'crypto';

@Injectable()
export class DigitalPaymentsService {
  private readonly logger = new Logger(DigitalPaymentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** A payment may only be confirmed from one of these; see confirmPayment. */
  private static readonly CONFIRMABLE = ['PENDING', 'PROCESSING'];

  async createPayment(companyId: string, dto: CreatePaymentDto) {
    if (!Number.isFinite(dto.amount)) {
      throw new BadRequestException('Amount must be a number');
    }
    // Round at the boundary, like every other money path on the platform. A
    // payment for R10.005 is a payment for R10.01, and storing the raw float
    // pushes the error into every sum taken over it later.
    const amount = Money.round(dto.amount);
    if (amount <= 0) {
      // Catches 0.004 as well: it is not negative, but it is not money either.
      throw new BadRequestException('Amount must be greater than 0');
    }

    const reference = `PAY-${randomBytes(6).toString('hex').toUpperCase()}`;

    return this.prisma.withTenant(companyId, (tx) =>
      tx.digitalPayment.create({
        data: {
          companyId,
          amount,
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
      }),
    );
  }

  async confirmPayment(companyId: string, dto: ConfirmPaymentDto) {
    const payment = await this.prisma.digitalPayment.findFirst({
      where: { reference: dto.reference, companyId },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === 'SUCCESS') {
      throw new BadRequestException('Payment already confirmed');
    }
    // Only a payment still in flight may be confirmed. The guard used to be
    // `status !== 'SUCCESS'`, which also matched FAILED and REFUNDED — so a
    // payment the gateway had rejected, or money already paid back out, could be
    // flipped to SUCCESS by a second confirm and re-enter totalRevenue.
    if (!DigitalPaymentsService.CONFIRMABLE.includes(payment.status)) {
      throw new BadRequestException(
        `A ${payment.status.toLowerCase()} payment cannot be confirmed`,
      );
    }

    await this.prisma.withTenant(companyId, (tx) =>
      claimTransition(
        () => tx.digitalPayment.updateMany({
          where: {
            id: payment.id,
            companyId,
            status: { in: DigitalPaymentsService.CONFIRMABLE },
          },
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
      // Summing floats accumulates their representation error: 0.1 + 0.2 + 10.15
      // + 20.25 comes back as 30.700000000000003. Round the total, not each row.
      totalRevenue: Money.round(totalRevenue._sum.amount ?? 0),
      successRate: total ? Math.round((successful / total) * 100) : 0,
    };
  }
}
