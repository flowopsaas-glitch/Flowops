import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventsGateway } from '../gateway/events.gateway';
import { guardTransition } from '../waybills/waybill-status.machine';
import { CodSettlementService } from './cod-settlement.service';
import { Money } from '../common/money.util';

@Injectable()
export class CodService {
  private readonly logger = new Logger(CodService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private gateway: EventsGateway,
    private settlements: CodSettlementService,
  ) {}

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

  /**
   * Record a COD collection.
   *
   * All of the integrity work (tenant check, driver mapping, billing evidence,
   * the compare-and-set that makes double settlement impossible, the wallet
   * credit and the ledger row) lives in CodSettlementService and happens in ONE
   * transaction. This method is the office-facing entry point and adds nothing
   * on top — which is what makes the office path and the driver-app path settle
   * identically.
   */
  async recordCollection(
    waybillId: string,
    companyId: string,
    actorId?: string,
    opts?: { collectedAmount?: number; note?: string },
  ) {
    return this.settlements.recordCollection({
      waybillId,
      companyId,
      collectedAmount: opts?.collectedAmount,
      note: opts?.note,
      actorId,
    });
  }

  /** Round a money value to 2 decimals via the shared integer-cents util. */
  private round2(n: number): number {
    return Money.round(n);
  }

  // ── Settle driver (driver remits cash to company) ─────────────────────────

  /** Delegates to the single atomic settlement path (tenant + balance guarded). */
  async settleDriver(driverId: string, amount: number, companyId: string, note?: string) {
    return this.settlements.settleDriver(driverId, amount, companyId, note);
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
    // Validate client-supplied coordinates — a driver app posts these, so they
    // are untrusted. Reject out-of-range values and clamp the radius so a
    // caller can't pass a huge radius to force every waybill OUT_FOR_DELIVERY.
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
        !Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new BadRequestException('Invalid GPS coordinates');
    }
    radiusM = Math.min(Math.max(Number(radiusM) || 500, 10), 2000); // 10m–2km

    // Tenant + driver safety: only this company's shipments for this driver.
    const shipments = await this.prisma.shipment.findMany({
      where: { driverId, companyId, status: { in: ['IN_TRANSIT'] } },
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

      // Within geofence — advance to OUT_FOR_DELIVERY through the state machine
      // (was a raw update bypassing guardTransition). Honours
      // WAYBILL_STRICT_TRANSITIONS: logged-only until strict mode is on.
      guardTransition(waybill.status as any, 'OUT_FOR_DELIVERY', {
        waybillId: waybill.id, trackingNumber: waybill.trackingNumber, actor: 'geofence',
      });
      await this.prisma.waybill.update({
        where: { id: waybill.id },
        data: { status: 'OUT_FOR_DELIVERY' },
      });
      // Note: the linked Shipment intentionally stays IN_TRANSIT — ShipmentStatus
      // has no OUT_FOR_DELIVERY state; the shipment advances to DELIVERED/FAILED
      // at POD/failed-attempt time. So there is no waybill/shipment split here.
      triggered.push(waybill.trackingNumber);

      // ── Close the loop ──────────────────────────────────────────────────
      // OUT_FOR_DELIVERY is a customer-facing milestone: tell the recipient
      // their parcel is arriving today and live-refresh the dispatch board.
      // Best-effort — geofence auto-advance must never fail on a notify error.
      void this.notifications.notifyWaybillStatus({
        companyId: waybill.companyId,
        trackingNumber: waybill.trackingNumber,
        recipientName: waybill.recipientName,
        recipientEmail: waybill.recipientEmail,
        status: 'OUT_FOR_DELIVERY',
      } as any);
      try {
        this.gateway.emitShipmentUpdate(waybill.companyId, {
          waybillId: waybill.id,
          trackingNumber: waybill.trackingNumber,
          status: 'OUT_FOR_DELIVERY',
          source: 'geofence',
        });
      } catch (err: any) {
        this.logger.warn(`Geofence realtime emit failed: ${err?.message ?? err}`);
      }
    }

    return { triggered, checkedShipments: shipments.length };
  }

  // ── Single wallet detail + ledger ──────────────────────────────────────────
  async getWallet(driverId: string, companyId: string) {
    // Tenant safety: only expose a wallet whose driver belongs to the caller's
    // company (was previously an unscoped findUnique by driverId → any tenant
    // could read any driver's cash ledger).
    const wallet = await this.prisma.driverWallet.findFirst({
      where: { driverId, driver: { companyId } },
      include: {
        driver: { select: { id: true, name: true, phone: true, vehicleReg: true, status: true } },
        transactions: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }
}
