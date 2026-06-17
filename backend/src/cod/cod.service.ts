import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CodService {
  constructor(private prisma: PrismaService) {}

  // ── Helpers ────────────────────────────────────────────────────────────

  /** Upsert a wallet for the given driver, returning it (create if absent). */
  private async ensureWallet(driverId: string, companyId: string) {
    return this.prisma.driverWallet.upsert({
      where: { driverId },
      create: { driverId, companyId, balance: 0, totalCollected: 0, totalSettled: 0 },
      update: {},
    });
  }

  // ── Record COD collection (driver received cash from recipient) ─────────

  async recordCollection(
    waybillId: string,
    driverId: string,
    companyId: string,
    amount?: number,
  ) {
    const waybill = await this.prisma.waybill.findFirst({
      where: { id: waybillId, companyId },
      select: { id: true, codAmount: true, codCollected: true, trackingNumber: true },
    });
    if (!waybill) throw new NotFoundException('Waybill not found');
    if (waybill.codCollected) throw new BadRequestException('COD already recorded for this waybill');

    const collected = amount ?? waybill.codAmount ?? 0;
    if (collected <= 0) throw new BadRequestException('COD amount must be greater than zero');

    const wallet = await this.ensureWallet(driverId, companyId);

    const [, , tx] = await this.prisma.$transaction([
      // Mark waybill as collected
      this.prisma.waybill.update({
        where: { id: waybillId },
        data: { codCollected: true, codCollectedAt: new Date(), codAmount: collected },
      }),
      // Increment wallet
      this.prisma.driverWallet.update({
        where: { id: wallet.id },
        data: {
          balance: { increment: collected },
          totalCollected: { increment: collected },
        },
      }),
      // Record transaction
      this.prisma.codTransaction.create({
        data: {
          type: 'COD_COLLECTED',
          amount: collected,
          waybillId,
          driverId,
          companyId,
          walletId: wallet.id,
          notes: `Collected on waybill ${waybill.trackingNumber}`,
        },
      }),
    ]);

    return { message: 'COD collection recorded', transaction: tx };
  }

  // ── Settle driver (driver remits cash to company) ──────────────────────

  async settleDriver(
    driverId: string,
    companyId: string,
    amount: number,
    notes?: string,
  ) {
    const wallet = await this.prisma.driverWallet.findFirst({
      where: { driverId, companyId },
    });
    if (!wallet) throw new NotFoundException('Driver wallet not found');
    if (amount <= 0) throw new BadRequestException('Settlement amount must be greater than zero');
    if (amount > wallet.balance + 0.01) {
      throw new BadRequestException(
        `Settlement amount (${amount}) exceeds outstanding balance (${wallet.balance.toFixed(2)})`,
      );
    }

    const [updatedWallet, tx] = await this.prisma.$transaction([
      this.prisma.driverWallet.update({
        where: { id: wallet.id },
        data: {
          balance: { decrement: amount },
          totalSettled: { increment: amount },
          lastSettledAt: new Date(),
        },
      }),
      this.prisma.codTransaction.create({
        data: {
          type: 'SETTLEMENT',
          amount,
          driverId,
          companyId,
          walletId: wallet.id,
          notes: notes ?? 'Cash remitted to company',
        },
      }),
    ]);

    return { message: 'Settlement recorded', wallet: updatedWallet, transaction: tx };
  }

  // ── Adjustment (manual correction) ────────────────────────────────────

  async adjustWallet(
    driverId: string,
    companyId: string,
    amount: number,
    notes: string,
  ) {
    const wallet = await this.ensureWallet(driverId, companyId);

    const [updatedWallet, tx] = await this.prisma.$transaction([
      this.prisma.driverWallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } },
      }),
      this.prisma.codTransaction.create({
        data: {
          type: 'ADJUSTMENT',
          amount,
          driverId,
          companyId,
          walletId: wallet.id,
          notes,
        },
      }),
    ]);

    return { message: 'Adjustment applied', wallet: updatedWallet, transaction: tx };
  }

  // ── Driver wallet detail ───────────────────────────────────────────────

  async getDriverWallet(driverId: string, companyId: string) {
    const wallet = await this.prisma.driverWallet.findFirst({
      where: { driverId, companyId },
      include: {
        driver: { select: { id: true, name: true, phone: true, vehicleReg: true, status: true } },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            waybill: { select: { trackingNumber: true, status: true } },
          },
        },
      },
    });
    if (!wallet) {
      // Return empty wallet shape if driver has no transactions yet
      const driver = await this.prisma.driver.findFirst({
        where: { id: driverId, companyId },
        select: { id: true, name: true, phone: true, vehicleReg: true, status: true },
      });
      if (!driver) throw new NotFoundException('Driver not found');
      return {
        id: null, balance: 0, totalCollected: 0, totalSettled: 0, lastSettledAt: null,
        driver, transactions: [],
      };
    }
    return wallet;
  }

  // ── All wallets for a company (leaderboard / summary) ─────────────────

  async listWallets(companyId: string) {
    return this.prisma.driverWallet.findMany({
      where: { companyId },
      include: {
        driver: { select: { id: true, name: true, phone: true, vehicleReg: true, status: true } },
        _count: { select: { transactions: true } },
      },
      orderBy: { balance: 'desc' },
    });
  }

  // ── Outstanding COD (waybills with amount set but not yet collected) ───

  async getOutstanding(companyId: string) {
    const rows = await this.prisma.waybill.findMany({
      where: {
        companyId,
        codAmount: { gt: 0 },
        codCollected: false,
        status: { notIn: ['CANCELLED', 'RETURNED'] },
      },
      include: {
        shipments: {
          take: 1,
          include: {
            driver: { select: { id: true, name: true, phone: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalOutstanding = rows.reduce((s, w) => s + (w.codAmount ?? 0), 0);
    return { totalOutstanding, count: rows.length, waybills: rows };
  }

  // ── Platform summary ────────────────────────────────────────────────────

  async getSummary(companyId: string) {
    const [outstanding, collected, settled, driverCount] = await Promise.all([
      this.prisma.waybill.aggregate({
        where: { companyId, codAmount: { gt: 0 }, codCollected: false },
        _sum: { codAmount: true },
        _count: { id: true },
      }),
      this.prisma.codTransaction.aggregate({
        where: { companyId, type: 'COD_COLLECTED' },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.codTransaction.aggregate({
        where: { companyId, type: 'SETTLEMENT' },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.driverWallet.count({
        where: { companyId, balance: { gt: 0.01 } },
      }),
    ]);

    // 30-day collection trend
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    const recent = await this.prisma.codTransaction.aggregate({
      where: { companyId, type: 'COD_COLLECTED', createdAt: { gt: d30 } },
      _sum: { amount: true },
      _count: { id: true },
    });

    return {
      currency: 'ZAR',
      outstanding: {
        amount: outstanding._sum.codAmount ?? 0,
        count: outstanding._count.id,
      },
      collected: {
        amount: collected._sum.amount ?? 0,
        count: collected._count.id,
      },
      settled: {
        amount: settled._sum.amount ?? 0,
        count: settled._count.id,
      },
      driversHoldingCash: driverCount,
      last30Days: {
        collected: recent._sum.amount ?? 0,
        count: recent._count.id,
      },
    };
  }

  // ── Transaction history for a company ─────────────────────────────────

  async listTransactions(companyId: string, limit = 100) {
    return this.prisma.codTransaction.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
      include: {
        driver: { select: { name: true } },
        waybill: { select: { trackingNumber: true } },
      },
    });
  }
}
