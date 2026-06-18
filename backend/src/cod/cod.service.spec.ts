import { Test } from '@nestjs/testing';
import { CodService } from './cod.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

// ── Minimal Prisma mock ──────────────────────────────────────────────────────

const makeWaybill = (overrides: Record<string, unknown> = {}) => ({
  id: 'wb1', trackingNumber: 'FO-00001', codAmount: 250, codCollected: false,
  companyId: 'co1',
  shipments: [{ driverId: 'drv1', driver: { id: 'drv1', name: 'Sipho' } }],
  ...overrides,
});

const makeWallet = (balance = 0) => ({
  id: 'wal1', driverId: 'drv1', balance, totalCollected: balance, totalSettled: 0,
});

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    waybill: {
      findFirst:  jest.fn(),
      findMany:   jest.fn().mockResolvedValue([]),
      update:     jest.fn(),
      aggregate:  jest.fn().mockResolvedValue({ _sum: { codAmount: 0 }, _count: { id: 0 } }),
    },
    driverWallet: {
      upsert:          jest.fn(),
      findUnique:      jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany:        jest.fn().mockResolvedValue([]),
      count:           jest.fn().mockResolvedValue(0),
      update:          jest.fn(),
    },
    codTransaction: {
      create:    jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
    },
    shipment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(async (fn: any) => fn({ // passes inner tx
      driverWallet: {
        upsert:           jest.fn().mockResolvedValue(makeWallet(250)),
        findUniqueOrThrow: jest.fn().mockResolvedValue(makeWallet(250)),
        update:           jest.fn().mockResolvedValue(makeWallet(0)),
      },
      codTransaction: { create: jest.fn() },
      waybill: { update: jest.fn() },
    })),
    ...overrides,
  } as unknown as PrismaService;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CodService', () => {
  let svc: CodService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module = await Test.createTestingModule({
      providers: [
        CodService,
        { provide: PrismaService, useValue: prisma },
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

    it('throws BadRequestException when COD already collected', async () => {
      (prisma.waybill.findFirst as jest.Mock).mockResolvedValue(makeWaybill({ codCollected: true }));
      await expect(svc.recordCollection('wb1', 'co1')).rejects.toThrow(BadRequestException);
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
      expect(result).toMatchObject({ collected: 250, driverId: 'drv1', walletBalance: 250 });
    });
  });

  // ── settleDriver ────────────────────────────────────────────────────────

  describe('settleDriver', () => {
    it('throws NotFoundException when wallet does not exist', async () => {
      (prisma.driverWallet.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(svc.settleDriver('drv1', 100, 'co1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when amount exceeds balance', async () => {
      (prisma.driverWallet.findUnique as jest.Mock).mockResolvedValue(makeWallet(50));
      await expect(svc.settleDriver('drv1', 100, 'co1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException on non-positive amount', async () => {
      (prisma.driverWallet.findUnique as jest.Mock).mockResolvedValue(makeWallet(200));
      await expect(svc.settleDriver('drv1', 0, 'co1')).rejects.toThrow(BadRequestException);
    });

    it('returns settled amount and new balance', async () => {
      (prisma.driverWallet.findUnique as jest.Mock).mockResolvedValue(makeWallet(300));
      const result = await svc.settleDriver('drv1', 100, 'co1');
      expect(result).toMatchObject({ settled: 100, newBalance: 0 });
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
      (prisma.waybill.update as jest.Mock).mockResolvedValue({});
      const res = await svc.checkGeofence('drv1', 'co1', -26.2041, 28.0473);
      expect(res.triggered).toContain('FO-001');
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
