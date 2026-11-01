/**
 * WP3 Stage 3: TripDocumentPack service — unit tests (mocked Prisma).
 *
 * Pins: tenant-scoped document CRUD, expiry thresholds (30/14/3 days),
 * expiry alert firing (outbox + gateway + notification), expired marking,
 * cross-tenant denial, and threshold configurability.
 */

import { TripDocumentPackService } from './trip-document-pack.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('TripDocumentPackService', () => {
  let service: TripDocumentPackService;
  let prisma: any;
  let audit: any;
  let outbox: any;
  let gateway: any;
  let notifications: any;

  const COMPANY = 'C-ACME';
  const OTHER_COMPANY = 'C-EVIL';

  beforeEach(() => {
    prisma = {
      trip: { findFirst: jest.fn() },
      tripDocumentPack: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      documentExpiryThreshold: {
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };
    audit = { record: jest.fn().mockResolvedValue('audit-1') };
    outbox = { enqueue: jest.fn().mockResolvedValue('outbox-1') };
    gateway = { broadcastToCompany: jest.fn() };
    notifications = { create: jest.fn().mockResolvedValue('notif-1') };
    service = new TripDocumentPackService(
      prisma as any,
      audit as any,
      outbox as any,
      gateway as any,
      notifications as any,
    );
  });

  // ── createDocument ───────────────────────────────────────────────────────

  describe('createDocument', () => {
    it('creates a tenant-scoped document and fires expiry alert when expiresAt set', async () => {
      prisma.trip.findFirst.mockResolvedValue({
        id: 'trip-1',
        companyId: COMPANY,
        reference: 'T-2026-0001',
      });
      prisma.tripDocumentPack.create.mockResolvedValue({
        id: 'doc-1',
        companyId: COMPANY,
        tripId: 'trip-1',
        documentType: 'Carnet de Passage',
        status: 'HELD',
        expiresAt: new Date('2026-12-01T00:00:00Z'),
      });
      prisma.documentExpiryThreshold.findMany.mockResolvedValue([]);

      const doc = await service.createDocument(COMPANY, {
        tripId: 'trip-1',
        documentType: 'Carnet de Passage',
        expiresAt: new Date('2026-12-01T00:00:00Z'),
        capturedBy: 'u-dispatch',
      });

      expect(doc.companyId).toBe(COMPANY);
      expect(doc.documentType).toBe('Carnet de Passage');
      expect(prisma.tripDocumentPack.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ companyId: COMPANY, tripId: 'trip-1' }),
        }),
      );
      expect(outbox.enqueue).toHaveBeenCalled();
      expect(gateway.broadcastToCompany).toHaveBeenCalled();
      expect(notifications.create).toHaveBeenCalled();
    });

    it('refuses a document for a trip not in the caller tenant', async () => {
      prisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        service.createDocument(COMPANY, {
          tripId: 'trip-foreign',
          documentType: 'Carnet de Passage',
          capturedBy: 'u-dispatch',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.tripDocumentPack.create).not.toHaveBeenCalled();
    });
  });

  // ── getDocuments ─────────────────────────────────────────────────────────

  describe('getDocuments', () => {
    it('scopes documents by companyId', async () => {
      prisma.tripDocumentPack.findMany.mockResolvedValue([]);

      await service.getDocuments(COMPANY, 'trip-1', 'HELD');

      expect(prisma.tripDocumentPack.findMany).toHaveBeenCalledWith({
        where: { companyId: COMPANY, tripId: 'trip-1', status: 'HELD' },
        orderBy: { expiresAt: 'asc', createdAt: 'desc' },
      });
    });
  });

  // ── getDocument ──────────────────────────────────────────────────────────

  describe('getDocument', () => {
    it('scopes document lookup by companyId', async () => {
      prisma.tripDocumentPack.findFirst.mockResolvedValue(null);

      await expect(service.getDocument(COMPANY, 'doc-foreign')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(prisma.tripDocumentPack.findFirst).toHaveBeenCalledWith({
        where: { id: 'doc-foreign', companyId: COMPANY },
      });
    });
  });

  // ── Expiry thresholds ────────────────────────────────────────────────────

  describe('thresholds', () => {
    it('uses default thresholds (30/14/3) when none configured', async () => {
      prisma.documentExpiryThreshold.findMany.mockResolvedValue([]);

      const thresholds = await service.getApplicableThresholds(COMPANY, 'Carnet de Passage');

      expect(thresholds).toEqual([30, 14, 3]);
    });

    it('uses company-configured thresholds', async () => {
      prisma.documentExpiryThreshold.findMany.mockResolvedValue([
        { companyId: COMPANY, documentType: 'Carnet de Passage', thresholdDays: 60 },
        { companyId: COMPANY, documentType: 'Carnet de Passage', thresholdDays: 7 },
      ]);

      const thresholds = await service.getApplicableThresholds(COMPANY, 'Carnet de Passage');

      expect(thresholds).toEqual([7, 60]);
    });

    it('rejects invalid thresholdDays', async () => {
      await expect(
        service.setThreshold(COMPANY, { documentType: 'Test', thresholdDays: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.setThreshold(COMPANY, { documentType: 'Test', thresholdDays: 400 }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.documentExpiryThreshold.upsert).not.toHaveBeenCalled();
    });

    it('sets a threshold and upserts', async () => {
      prisma.documentExpiryThreshold.upsert.mockResolvedValue({
        id: 'thr-1',
        companyId: COMPANY,
        documentType: 'Carnet de Passage',
        thresholdDays: 45,
      });

      const thr = await service.setThreshold(COMPANY, {
        documentType: 'Carnet de Passage',
        thresholdDays: 45,
      });

      expect(thr.thresholdDays).toBe(45);
      expect(prisma.documentExpiryThreshold.upsert).toHaveBeenCalledWith({
        where: { companyId_documentType: { companyId: COMPANY, documentType: 'Carnet de Passage' } },
        update: expect.anything(),
        create: expect.anything(),
      });
    });
  });

  // ── checkDocumentExpiry ──────────────────────────────────────────────────

  describe('checkDocumentExpiry', () => {
    const doc = {
      id: 'doc-1',
      companyId: COMPANY,
      tripId: 'trip-1',
      documentType: 'Carnet de Passage',
      status: 'HELD',
      expiresAt: new Date(),
      trip: { id: 'trip-1', reference: 'T-2026-0001' },
    };

    it('fires expiring_soon alert when within 30 days', async () => {
      const thirtyDaysFromNow = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days
      const docWithExpiry = { ...doc, expiresAt: thirtyDaysFromNow };

      prisma.tripDocumentPack.findFirst.mockResolvedValue(docWithExpiry);
      prisma.documentExpiryThreshold.findMany.mockResolvedValue([]);

      await service.checkDocumentExpiry('doc-1', COMPANY, thirtyDaysFromNow, 'Carnet de Passage');

      expect(outbox.enqueue).toHaveBeenCalledWith(
        expect.anything(),
        COMPANY,
        'trip.document.expiring_soon',
        expect.objectContaining({ documentType: 'Carnet de Passage', thresholdDays: 30 }),
      );
      expect(gateway.broadcastToCompany).toHaveBeenCalledWith(
        COMPANY,
        'trip.document.expiring_soon',
        expect.anything(),
      );
      expect(notifications.create).toHaveBeenCalled();
    });

    it('fires expired alert when already past expiry', async () => {
      const pastExpiry = new Date(Date.now() - 86400000); // 1 day ago
      const docExpired = { ...doc, expiresAt: pastExpiry, status: 'HELD' };

      prisma.tripDocumentPack.findFirst.mockResolvedValue(docExpired);
      prisma.tripDocumentPack.update.mockResolvedValue({ ...docExpired, status: 'EXPIRED' });

      await service.checkDocumentExpiry('doc-1', COMPANY, pastExpiry, 'Carnet de Passage');

      expect(outbox.enqueue).toHaveBeenCalledWith(
        expect.anything(),
        COMPANY,
        'trip.document.expired',
        expect.objectContaining({ documentType: 'Carnet de Passage' }),
      );
    });

    it('skips documents with NOT_APPLICABLE status', async () => {
      const docNA = { ...doc, status: 'NOT_APPLICABLE' };
      prisma.tripDocumentPack.findFirst.mockResolvedValue(docNA);

      await service.checkDocumentExpiry('doc-1', COMPANY, new Date(), 'Carnet de Passage');

      expect(outbox.enqueue).not.toHaveBeenCalled();
      expect(gateway.broadcastToCompany).not.toHaveBeenCalled();
    });

    it('skips documents that are already EXPIRED', async () => {
      const docExp = { ...doc, status: 'EXPIRED' };
      prisma.tripDocumentPack.findFirst.mockResolvedValue(docExp);

      await service.checkDocumentExpiry('doc-1', COMPANY, new Date(), 'Carnet de Passage');

      expect(outbox.enqueue).not.toHaveBeenCalled();
    });
  });

  // ── Cross-tenant isolation ───────────────────────────────────────────────

  it('does not leak documents across tenants in getDocuments', async () => {
    prisma.tripDocumentPack.findMany.mockResolvedValue([]);

    await service.getDocuments(OTHER_COMPANY, 'trip-1');

    expect(prisma.tripDocumentPack.findMany).toHaveBeenCalledWith({
      where: { companyId: OTHER_COMPANY, tripId: 'trip-1' },
      orderBy: expect.anything(),
    });
  });
});
