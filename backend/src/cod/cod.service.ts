import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CodService {
  constructor(private prisma: PrismaService) {}

  // ── Summary KPIs ───────────────────────────────────────────────────────────

  async getSummary(companyId: string) {
    const [outstanding, collected, settled, driversHolding] = await Promise.all([
      // Total COD value on undelivered / uncollected waybills
      this.prisma.waybill.aggregate({
        where: { companyId, codAmount: { gt: 0 }, codCollected: false },
        _sum: { codAmount: true },
        _count: { id: true },
      }),
      // Amount collected but not yet settled
      this.prisma.codTransaction.aggregate({
        where: { companyId, type: 'COLLECTION' },
        _sum: { amount: true },
      }),
      // Amount already settled to company
      this.prisma.codTransaction.aggregate({
        where: { companyId, type: 'SETTLEMENT' },
        _sum: { amount: true },
      }),
      // Drivers with positive balance (holding cash)
      this.prisma.driverWallet.count({
        where: { balance: { gt: 0 }, driver: { companyId } },
      }),
    ]);

    return {
      outstanding:    outstanding._sum.codAmount ?? 0,
      outstandingCount: outstanding._count.id,
      collected:      collected._sum.amount ?? 0,
      settled:        settled._sum.amount ?? 0,
      driversHolding,
    };
  }

  // ── Waybills pending COD collection ───────────────────────────────────────

  async getOutstandingWaybills(companyId: string) {
    return this.prisma.waybill.findMany({
      where: {
        companyId,
        codAmount: { gt: 0 },
        codCollected: false,
        status: { in: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'] },
      },
      select: {
        id: true, trackingNumber: true, status: true, codAmount: true,
        recipientName: true, recipientAddress: true, createdAt: true,
        shipments: {
          select: { driver: { select: { id: true, name: true } } },
          take: 1,
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
  }

  // ── Record cash collection ─────────────────────────────────────────────────

  async recordCollection(waybillId: string, companyId: string, actorId?: string) {
    const waybill = await this.prisma.waybill.findFirst({
      where: { id: waybillId, companyId },
      include: { shipments: { take: 1, include: { driver: true } } },
    });
    if (!waybill) throw new NotFoundException('Waybill not found');
    if (!waybill.codAmount || waybill.codAmount <= 0)
      throw new BadRequestException('Waybill has no COD amount');
    if (waybill.codCollected)
      throw new BadRequestException('COD already collected for this waybill');

    const driverId = waybill.shipments[0]?.driverId;
    if (!driverId) throw new BadRequestException('No driver assigned to this waybill');

    return this.prisma.$transaction(async (tx) => {
      // Upsert the driver wallet
      let wallet = await tx.driverWallet.upsert({
        where: { driverId },
        update: {
          balance:        { increment: waybill.codAmount! },
          totalCollected: { increment: waybill.codAmount! },
        },
        create: {
          driverId,
          balance:        waybill.codAmount!,
          totalCollected: waybill.codAmount!,
        },
      });

      // Re-fetch the updated balance for the transaction record
      wallet = await tx.driverWallet.findUniqueOrThrow({ where: { driverId } });

      await tx.codTransaction.create({
        data: {
          walletId: wallet.id, waybillId, companyId,
          type: 'COLLECTION', amount: waybill.codAmount!, balance: wallet.balance,
          note: `Collected for ${waybill.trackingNumber}`,
        },
      });

      await tx.waybill.update({
        where: { id: waybillId },
        data: { codCollected: true, codCollectedAt: new Date() },
      });

      return { collected: waybill.codAmount, driverId, walletBalance: wallet.balance };
    });
  }

  // ── Settle driver (driver remits cash to company) ─────────────────────────

  async settleDriver(driverId: string, amount: number, companyId: string, note?: string) {
    const wallet = await this.prisma.driverWallet.findUnique({ where: { driverId } });
    if (!wallet) throw new NotFoundException('Driver wallet not found');
    if (amount > wallet.balance)
      throw new BadRequestException(`Settlement amount (${amount}) exceeds balance (${wallet.balance})`);
    if (amount <= 0) throw new BadRequestException('Settlement amount must be positive');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.driverWallet.update({
        where: { driverId },
        data: {
          balance:       { decrement: amount },
          totalSettled:  { increment: amount },
          lastSettledAt: new Date(),
        },
      });

      await tx.codTransaction.create({
        data: {
          walletId: wallet.id, companyId,
          type: 'SETTLEMENT', amount, balance: updated.balance,
          note: note || 'Manual settlement',
        },
      });

      return { settled: amount, newBalance: updated.balance };
    });
  }

  // ── List all driver wallets ────────────────────────────────────────────────

  async listWallets(companyId: string) {
    return this.prisma.driverWallet.findMany({
      where: { driver: { companyId } },
      include: {
        driver: { select: { id: true, name: true, phone: true, vehicleReg: true, status: true } },
        _count: { select: { transactions: true } },
      },
      orderBy: { balance: 'desc' },
    });
  }

  // ── Geofence auto-trigger ─────────────────────────────────────────────────

  private haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Called by the driver app when GPS position updates.
   * Auto-advances IN_TRANSIT waybills within radiusM to OUT_FOR_DELIVERY.
   */
  async checkGeofence(
    driverId: string,
    companyId: string,
    lat: number,
    lng: number,
    radiusM = 500,
  ) {
    const shipments = await this.prisma.shipment.findMany({
      where: { driverId, status: { in: ['IN_TRANSIT'] } },
      include: {
        waybill: {
          select: {
            id: true, trackingNumber: true, recipientName: true,
            recipientLat: true, recipientLng: true,
            recipientEmail: true, status: true, companyId: true,
          },
        },
      },
    });

    const triggered: string[] = [];

    for (const shipment of shipments) {
      const { waybill } = shipment;
      if (!waybill || waybill.status !== 'IN_TRANSIT') continue;
      if (waybill.recipientLat == null || waybill.recipientLng == null) continue;
      if (waybill.companyId !== companyId) continue;

      const dist = this.haversineMetres(lat, lng, waybill.recipientLat, waybill.recipientLng);
      if (dist > radiusM) continue;

      // Within geofence — advance to OUT_FOR_DELIVERY
      await this.prisma.waybill.update({
        where: { id: waybill.id },
        data: { status: 'OUT_FOR_DELIVERY' },
      });
      triggered.push(waybill.trackingNumber);
    }

    return { triggered, checkedShipments: shipments.length };
  }

  // ── Single wallet detail + ledger ──────────────────────────────────────────
  async getWallet(driverId: string) {
    const wallet = await this.prisma.driverWallet.findUnique({
      where: { driverId },
      include: {
        driver: { select: { id: true, name: true, phone: true, vehicleReg: true, status: true } },
        transactions: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }
}
