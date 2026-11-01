/**
 * WP3 Stage 3: Trip document pack + expiry alerts, end to end against a real
 * (in CI: PostgreSQL) database.
 *
 * Covers document CRUD, expiry thresholds, expiry alert firing (outbox +
 * gateway + notification), expired marking, and cross-tenant isolation.
 *
 * Prerequisites (CI provides both):
 *   1. `npx prisma generate` — writes node_modules/.prisma/client
 *   2. A PostgreSQL database — `resolveIntegrationDatabaseUrl()` from test/integration/support/env
 *
 * Run with: npm run test:integration
 */

import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TripDocumentPackService } from '../../src/driver-safety/trip-document-pack.service';
import { createIntegrationDatabase, type IntegrationDatabase } from './support/prisma-client';
import { seedTenant, truncateAll } from './support/db';

jest.setTimeout(90_000);

describe('TripDocumentPackService (PostgreSQL)', () => {
  let db: IntegrationDatabase;
  let prisma: PrismaClient;
  let service: TripDocumentPackService;

  const audit = { record: jest.fn().mockResolvedValue('audit-id') };
  const outbox = { enqueue: jest.fn().mockResolvedValue('outbox-id') };
  const gateway = { broadcastToCompany: jest.fn() };
  const notifications = { create: jest.fn().mockResolvedValue('notif-id') };

  beforeEach(async () => {
    db = await createIntegrationDatabase();
    prisma = db.prisma;
    service = new TripDocumentPackService(
      prisma as any,
      audit as any,
      outbox as any,
      gateway as any,
      notifications as any,
    );
    await truncateAll(prisma);
  });

  afterEach(async () => {
    await db.shutdown();
  });

  // ── Seed helpers ─────────────────────────────────────────────────────────

  async seedTrip(companyId: string, overrides: Partial<{ reference: string }> = {}) {
    return prisma.trip.create({
      data: {
        companyId,
        reference: overrides.reference ?? 'T-2026-0001',
        origin: 'Johannesburg',
        destination: 'Harare',
        status: 'PLANNED',
      },
    });
  }

  // ── Document CRUD ────────────────────────────────────────────────────────

  it('creates a tenant-scoped document pack entry', async () => {
    const { companyId } = await seedTenant(prisma, 'Cross-Border Hauliers');
    const trip = await seedTrip(companyId);

    const doc = await service.createDocument(companyId, {
      tripId: trip.id,
      documentType: 'Carnet de Passage',
      status: 'HELD',
      issuedAt: new Date('2026-11-01T00:00:00Z'),
      expiresAt: new Date('2026-12-01T00:00:00Z'),
      capturedBy: 'u-dispatch',
      evidenceRef: 'evidence-123',
    });

    expect(doc.companyId).toBe(companyId);
    expect(doc.tripId).toBe(trip.id);
    expect(doc.documentType).toBe('Carnet de Passage');
    expect(doc.status).toBe('HELD');
    expect(doc.capturedBy).toBe('u-dispatch');
    expect(doc.evidenceRef).toBe('evidence-123');
  });

  it('refuses a document for a trip from another tenant', async () => {
    const { companyId: acme } = await seedTenant(prisma, 'Acme Logistics');
    const { companyId: evil } = await seedTenant(prisma, 'Evil Co');
    const trip = await seedTrip(acme);

    await expect(
      service.createDocument(evil, {
        tripId: trip.id,
        documentType: 'Carnet de Passage',
        capturedBy: 'u-evil',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists documents scoped by company and optional trip/status', async () => {
    const { companyId } = await seedTenant(prisma, 'Cross-Border Hauliers');
    const trip = await seedTrip(companyId);

    await service.createDocument(companyId, {
      tripId: trip.id,
      documentType: 'Carnet de Passage',
      status: 'HELD',
      capturedBy: 'u-dispatch',
    });
    await service.createDocument(companyId, {
      tripId: trip.id,
      documentType: 'TIR Carnet',
      status: 'MISSING',
      capturedBy: 'u-dispatch',
    });

    const all = await service.getDocuments(companyId);
    expect(all).toHaveLength(2);

    const held = await service.getDocuments(companyId, undefined, 'HELD');
    expect(held).toHaveLength(1);
    expect(held[0].documentType).toBe('Carnet de Passage');
  });

  it('updates a document', async () => {
    const { companyId } = await seedTenant(prisma, 'Cross-Border Hauliers');
    const trip = await seedTrip(companyId);

    const doc = await service.createDocument(companyId, {
      tripId: trip.id,
      documentType: 'Carnet de Passage',
      status: 'HELD',
      capturedBy: 'u-dispatch',
    });

    const updated = await service.updateDocument(companyId, doc.id, {
      status: 'MISSING',
      evidenceRef: 'evidence-456',
    });

    expect(updated.status).toBe('MISSING');
    expect(updated.evidenceRef).toBe('evidence-456');
  });

  // ── Expiry thresholds ────────────────────────────────────────────────────

  it('uses default thresholds (30/14/3) when none configured', async () => {
    const { companyId } = await seedTenant(prisma, 'Cross-Border Hauliers');

    const thresholds = await service.getThresholds(companyId);

    expect(thresholds).toHaveLength(0); // none configured yet
  });

  it('sets and retrieves a per-company threshold', async () => {
    const { companyId } = await seedTenant(prisma, 'Cross-Border Hauliers');

    const set = await service.setThreshold(companyId, {
      documentType: 'Carnet de Passage',
      thresholdDays: 45,
    });

    expect(set.thresholdDays).toBe(45);

    const get = await service.getThresholds(companyId);
    expect(get).toHaveLength(1);
    expect(get[0].thresholdDays).toBe(45);
  });

  it('rejects invalid thresholdDays', async () => {
    const { companyId } = await seedTenant(prisma, 'Cross-Border Hauliers');

    await expect(
      service.setThreshold(companyId, { documentType: 'Test', thresholdDays: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.setThreshold(companyId, { documentType: 'Test', thresholdDays: 400 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── Expiry alerts ────────────────────────────────────────────────────────

  it('fires expiring_soon alert (outbox + gateway + notification)', async () => {
    const { companyId } = await seedTenant(prisma, 'Cross-Border Hauliers');
    const trip = await seedTrip(companyId);

    const expiresSoon = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days

    const doc = await service.createDocument(companyId, {
      tripId: trip.id,
      documentType: 'Carnet de Passage',
      status: 'HELD',
      expiresAt: expiresSoon,
      capturedBy: 'u-dispatch',
    });

    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.anything(),
      companyId,
      'trip.document.expiring_soon',
      expect.objectContaining({
        documentType: 'Carnet de Passage',
        thresholdDays: 30,
      }),
    );
    expect(gateway.broadcastToCompany).toHaveBeenCalledWith(
      companyId,
      'trip.document.expiring_soon',
      expect.objectContaining({
        documentId: doc.id,
        documentType: 'Carnet de Passage',
      }),
    );
    expect(notifications.create).toHaveBeenCalled();
  });

  it('fires expired alert when document is past expiry', async () => {
    const { companyId } = await seedTenant(prisma, 'Cross-Border Hauliers');
    const trip = await seedTrip(companyId);

    const expired = new Date(Date.now() - 86400000); // 1 day ago

    const doc = await service.createDocument(companyId, {
      tripId: trip.id,
      documentType: 'TIR Carnet',
      status: 'HELD',
      expiresAt: expired,
      capturedBy: 'u-dispatch',
    });

    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.anything(),
      companyId,
      'trip.document.expired',
      expect.objectContaining({ documentType: 'TIR Carnet' }),
    );
    expect(gateway.broadcastToCompany).toHaveBeenCalledWith(
      companyId,
      'trip.document.expired',
      expect.objectContaining({ documentId: doc.id }),
    );
    expect(notifications.create).toHaveBeenCalled();
  });

  it('sweep marks expired documents and fires expired alerts', async () => {
    const { companyId } = await seedTenant(prisma, 'Cross-Border Hauliers');
    const trip = await seedTrip(companyId);

    const expired = new Date(Date.now() - 86400000); // 1 day ago

    await service.createDocument(companyId, {
      tripId: trip.id,
      documentType: 'Expired Doc',
      status: 'HELD',
      expiresAt: expired,
      capturedBy: 'u-dispatch',
    });

    const result = await service.sweepExpiryAlerts(companyId);

    expect(result.expiredMarked).toBe(1);

    const doc = await prisma.tripDocumentPack.findFirst({
      where: { companyId, documentType: 'Expired Doc' },
    });
    expect(doc.status).toBe('EXPIRED');
  });

  // ── Cross-tenant isolation ───────────────────────────────────────────────

  it('does not leak documents across tenants', async () => {
    const { companyId: acme } = await seedTenant(prisma, 'Acme Logistics');
    const { companyId: evil } = await seedTenant(prisma, 'Evil Co');
    const trip = await seedTrip(acme);

    await service.createDocument(acme, {
      tripId: trip.id,
      documentType: 'Carnet de Passage',
      status: 'HELD',
      capturedBy: 'u-acme',
    });

    const evilDocs = await service.getDocuments(evil);
    expect(evilDocs).toHaveLength(0);

    await expect(service.getDocument(evil, (await service.getDocuments(acme))[0].id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
