import { Test } from '@nestjs/testing';
import { CodService } from './cod.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventsGateway } from '../gateway/events.gateway';
import { CodSettlementService } from './cod-settlement.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

// ── Minimal Prisma mock ──────────────────────────────────────────────────────

const makeWaybill = (overrides: Record<string, unknown> = {}) => ({
  id: 'wb1', trackingNumber: 'FO-00001', codAmount: 250, codCollected: false,
  companyId: 'co1',
  shipments: [{ driverId: 'drv1', driver: { id: 'drv1', companyId: 'co1', isActive: true, name: 'Sipho' } }],
  ...overrides,
});

const makeWallet = (balance = 0) => ({
  id: 'wal1', driverId: 'drv1', balance, totalCollected: balance, totalSettled: 0,
});

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    driver: {
      // Default: driver exists in the caller's company (tenant check passes).
      findFirst: jest.fn().mockResolvedValue({ id: 'drv1' }),
    },
    waybill: {
      findFirst:  jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany:   jest.fn().mockResolvedValue([]),
      update:     jest.fn(),
      aggregate:  jest.fn().mockResolvedValue({ _sum: { codAmount: 0 }, _count: { id: 0 } }),
    },
    driverWallet: {
      upsert:          jest.fn(),
      findUnique:      jest.fn(),
      findFirst:       jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany:        jest.fn().mockResolvedValue([]),
      count:           jest.fn().mockResolvedValue(0),
      update:          jest.fn(),
      updateMany:      jest.fn(),
    },
    codTransaction: {
      create:    jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
    },
    shipment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    invoiceItem: {
      findFirst: jest.fn().mockResolvedValue({ id: 'ii1', invoice: { id: 'inv1', status: 'SENT' } }),
    },
    // Inner tx: settleDriver reads the wallet, does a guarded updateMany, then
    // re-reads. recordCollection upserts + re-reads. Defaults model a
    // sufficient balance so the guarded decrement succeeds (count: 1).
    $transaction: jest.fn(async (fn: any) => fn({
      driverWallet: {
        upsert:           jest.fn().mockResolvedValue(makeWallet(250)),
        findUnique:       jest.fn().mockResolvedValue(makeWallet(300)),
        findUniqueOrThrow: jest.fn().mockResolvedValue(makeWallet(250)),
        updateMany:       jest.fn().mockResolvedValue({ count: 1 }),
        update:           jest.fn().mockResolvedValue(makeWallet(0)),
      },
      codTransaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'ct1' }),
      },
      waybill: { update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    })),
    ...overrides,
  } as unknown as PrismaService;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CodService', () => {
  let svc: CodService;
  let prisma: ReturnType<typeof makePrisma>;
  let notifications: { notifyWaybillStatus: jest.Mock };
  let gateway: { emitShipmentUpdate: jest.Mock };

  beforeEach(async () => {
    prisma = makePrisma();
    notifications = { notifyWaybillStatus: jest.fn() };
    gateway = { emitShipmentUpdate: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        CodService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: EventsGateway, useValue: gateway },
        CodSettlementService,
      ],
    }).compile();
    svc = module.get(CodService);
  });

  // ── recordCollection ────────────────────────────────────────────────────

  describe('recordCollection', () => {
    it('throws NotFoundException when waybill is missing', async () => {
      (prisma.waybill.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(svc.recordCollection('wb1', 'co1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when codAmount is 0', async () => {
      (prisma.waybill.findFirst as jest.Mock).mockResolvedValue(makeWaybill({ codAmount: 0 }));
      await expect(svc.recordCollection('wb1', 'co1')).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when COD has already been collected (guarded by the CAS claim)', async () => {
      (prisma.waybill.findFirst as jest.Mock).mockResolvedValue(makeWaybill({ codCollected: true }));
      (prisma.$transaction as jest.Mock).mockImplementationOnce(async (fn: any) => fn({
        waybill: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) }, // already claimed
        driverWallet: {}, codTransaction: {},
      }));
      await expect(svc.recordCollection('wb1', 'co1')).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when no driver assigned', async () => {
      (prisma.waybill.findFirst as jest.Mock).mockResolvedValue(
        makeWaybill({ shipments: [] }),
      );
      await expect(svc.recordCollection('wb1', 'co1')).rejects.toThrow(BadRequestException);
    });

    it('returns collected amount and wallet balance on success', async () => {
      (prisma.waybill.findFirst as jest.Mock).mockResolvedValue(makeWaybill());
      const result = await svc.recordCollection('wb1', 'co1');
      // Default (no amount supplied) = exact collection of the owed amount.
      expect(result).toMatchObject({ collected: 250, owed: 250, discrepancy: 0, exact: true });
    });

    it('records a SHORT collection with a negative discrepancy', async () => {
      (prisma.waybill.findFirst as jest.Mock).mockResolvedValue(makeWaybill()); // owed 250
      const result = await svc.recordCollection('wb1', 'co1', undefined, { collectedAmount: 200 });
      expect(result).toMatchObject({ collected: 200, owed: 250, discrepancy: -50, exact: false });
    });

    it('records an OVER collection with a positive discrepancy', async () => {
      (prisma.waybill.findFirst as jest.Mock).mockResolvedValue(makeWaybill()); // owed 250
      const result = await svc.recordCollection('wb1', 'co1', undefined, { collectedAmount: 300 });
      expect(result).toMatchObject({ collected: 300, owed: 250, discrepancy: 50, exact: false });
    });

    it('rejects a negative collected amount', async () => {
      (prisma.waybill.findFirst as jest.Mock).mockResolvedValue(makeWaybill());
      await expect(
        svc.recordCollection('wb1', 'co1', undefined, { collectedAmount: -10 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── settleDriver ────────────────────────────────────────────────────────

  describe('settleDriver', () => {
    it('throws NotFoundException when the driver is not in the caller company', async () => {
      (prisma.driver.findFirst as jest.Mock).mockResolvedValue(null); // tenant check fails
      await expect(svc.settleDriver('drv1', 100, 'co1', '00000000-0000-4000-8000-000000000001')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when wallet does not exist', async () => {
      // Driver in-company, but no wallet inside the transaction.
      (prisma.$transaction as jest.Mock).mockImplementationOnce(async (fn: any) => fn({
        driverWallet: { findUnique: jest.fn().mockResolvedValue(null) },
        codTransaction: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      }));
      await expect(svc.settleDriver('drv1', 100, 'co1', '00000000-0000-4000-8000-000000000001')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when amount exceeds balance (guarded decrement returns 0)', async () => {
      (prisma.$transaction as jest.Mock).mockImplementationOnce(async (fn: any) => fn({
        driverWallet: {
          findUnique: jest.fn().mockResolvedValue(makeWallet(50)),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }), // insufficient balance
          findUniqueOrThrow: jest.fn(),
        },
        codTransaction: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      }));
      await expect(svc.settleDriver('drv1', 100, 'co1', '00000000-0000-4000-8000-000000000001')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException on non-positive amount', async () => {
      await expect(svc.settleDriver('drv1', 0, 'co1', '00000000-0000-4000-8000-000000000001')).rejects.toThrow(BadRequestException);
    });

    it('returns settled amount and new balance', async () => {
      (prisma.$transaction as jest.Mock).mockImplementationOnce(async (fn: any) => fn({
        driverWallet: {
          findUnique: jest.fn().mockResolvedValue(makeWallet(100)),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue(makeWallet(0)),
        },
        codTransaction: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'ct-settlement-1' }) },
      }));
      const result = await svc.settleDriver('drv1', 100, 'co1', '00000000-0000-4000-8000-000000000001');
      expect(result).toMatchObject({ settled: 100, newBalance: 0, ledgerTransactionId: 'ct-settlement-1', replayed: false });
    });
  });

  // ── haversineMetres (private) via geofence ──────────────────────────────

  describe('checkGeofence', () => {
    it('returns zero triggered when no in-transit shipments exist', async () => {
      (prisma.shipment.findMany as jest.Mock).mockResolvedValue([]);
      const res = await svc.checkGeofence('drv1', 'co1', -26.2041, 28.0473);
      expect(res.triggered).toHaveLength(0);
    });

    it('triggers when driver is within default 500 m radius', async () => {
      (prisma.shipment.findMany as jest.Mock).mockResolvedValue([{
        driverId: 'drv1',
        status: 'IN_TRANSIT',
        waybill: {
          id: 'wb1', trackingNumber: 'FO-001', recipientName: 'Test',
          recipientLat: -26.2040, recipientLng: 28.0472, // ~15m away
          recipientEmail: null, status: 'IN_TRANSIT', companyId: 'co1',
        },
      }]);
      (prisma.waybill.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      const res = await svc.checkGeofence('drv1', 'co1', -26.2041, 28.0473);
      expect(res.triggered).toContain('FO-001');
      expect(prisma.waybill.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'OUT_FOR_DELIVERY' } }),
      );
    });

    it('REGRESSION: a parcel delivered while the loop ran is not dragged back to OUT_FOR_DELIVERY', async () => {
      (prisma.shipment.findMany as jest.Mock).mockResolvedValue([{
        driverId: 'drv1',
        status: 'IN_TRANSIT',
        waybill: {
          id: 'wb1', trackingNumber: 'FO-003', recipientName: 'Test',
          recipientLat: -26.2040, recipientLng: 28.0472,
          recipientEmail: null, status: 'IN_TRANSIT', companyId: 'co1',
        },
      }]);
      // The compare-and-set finds nothing: a POD (or a failed attempt) moved the
      // parcel on between the read above and this write.
      (prisma.waybill.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      const res = await svc.checkGeofence('drv1', 'co1', -26.2041, 28.0473);

      expect(res.triggered).toHaveLength(0);
      expect(prisma.waybill.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wb1', companyId: 'co1', status: 'IN_TRANSIT' },
        }),
      );
      // No "arriving today" notification for a parcel that already arrived.
      expect(notifications.notifyWaybillStatus).not.toHaveBeenCalled();
    });

    it('does NOT trigger when driver is outside the radius', async () => {
      (prisma.shipment.findMany as jest.Mock).mockResolvedValue([{
        driverId: 'drv1',
        status: 'IN_TRANSIT',
        waybill: {
          id: 'wb1', trackingNumber: 'FO-002',
          recipientLat: -33.9249, recipientLng: 18.4241, // Cape Town vs JHB
          recipientEmail: null, status: 'IN_TRANSIT', companyId: 'co1',
          recipientName: 'Test',
        },
      }]);
      const res = await svc.checkGeofence('drv1', 'co1', -26.2041, 28.0473);
      expect(res.triggered).toHaveLength(0);
    });
  });
});
