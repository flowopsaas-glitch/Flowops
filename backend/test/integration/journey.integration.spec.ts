/**
 * Journey truth + communication, end to end against a real (in CI: PostgreSQL) database.
 *
 * Covers the office→journey and driver→dispatch write paths with the real
 * Prisma client, so row locks, unique-constraint races and cascades are
 * exercised — things the in-memory unit-test double cannot prove.
 *
 * Prerequisites (CI provides both):
 *   1. `npx prisma generate` — writes node_modules/.prisma/client
 *   2. A PostgreSQL database — `resolveIntegrationDatabaseUrl()` from test/integration/support/env
 *
 * Run with:  npm run test:integration
 */

import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { JourneyService } from '../../src/driver-portal/journey.service';
import { createIntegrationDatabase, type IntegrationDatabase } from './support/prisma-client';
import { seedTenant, truncateAll } from './support/db';

jest.setTimeout(90_000);

describe('JourneyService (PostgreSQL)', () => {
  let db: IntegrationDatabase;
  let prisma: PrismaClient;
  let service: JourneyService;

  const audit = { record: jest.fn().mockResolvedValue('audit-id') };

  beforeEach(async () => {
    db = await createIntegrationDatabase();
    prisma = db.prisma;
    service = new JourneyService(
      prisma as any,
      audit as any,
    );
    await truncateAll(prisma);
  });

  afterEach(async () => {
    await db.shutdown();
  });

  it('creates a tenant-scoped journey with a reference', async () => {
    const { companyId } = await seedTenant(prisma, 'Journey Co');
    const driver = await prisma.driver.create({
      data: { name: 'Ace Driver', phone: '+27 82 000 0000', companyId, isActive: true },
    });

    const journey = await service.createJourney(companyId, {
      reference: 'J-2026-0001',
      driverId: driver.id,
      origin: 'Cape Town',
      destination: 'Johannesburg',
    });

    expect(journey.companyId).toBe(companyId);
    expect(journey.reference).toBe('J-2026-0001');
    expect(journey.driverId).toBe(driver.id);
    expect(journey.status).toBe('PLANNED');
    expect(journey.origin).toBe('Cape Town');
    expect(journey.destination).toBe('Johannesburg');
  });

  it('rejects a journey with an empty reference', async () => {
    const { companyId } = await seedTenant(prisma, 'Journey Co');
    await expect(
      service.createJourney(companyId, { reference: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a driver not in the company when creating a journey', async () => {
    const { companyId } = await seedTenant(prisma, 'Journey Co');
    const { companyId: otherCompanyId } = await seedTenant(prisma, 'Other Co');
    const driver = await prisma.driver.create({
      data: { name: 'Ace Driver', phone: '+27 82 000 0000', companyId: otherCompanyId, isActive: true },
    });

    await expect(
      service.createJourney(companyId, { reference: 'J-2026-0002', driverId: driver.id }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adds ordered stages to a journey', async () => {
    const { companyId } = await seedTenant(prisma, 'Journey Co');
    const driver = await prisma.driver.create({
      data: { name: 'Ace Driver', phone: '+27 82 000 0000', companyId, isActive: true },
    });
    const journey = await service.createJourney(companyId, {
      reference: 'J-2026-0003',
      driverId: driver.id,
    });

    const s1 = await service.addStage(companyId, journey.id, {
      stageNumber: 1,
      type: 'PICKUP',
      locationName: 'Cape Town Depot',
      plannedAt: new Date('2026-12-01T08:00:00Z'),
    });
    const s2 = await service.addStage(companyId, journey.id, {
      stageNumber: 2,
      type: 'BORDER',
      locationName: 'Beitbridge',
      plannedAt: new Date('2026-12-01T14:00:00Z'),
    });
    const s3 = await service.addStage(companyId, journey.id, {
      stageNumber: 3,
      type: 'DELIVERY',
      locationName: 'Johannesburg Warehouse',
      plannedAt: new Date('2026-12-02T08:00:00Z'),
    });

    expect(s1.stageNumber).toBe(1);
    expect(s2.stageNumber).toBe(2);
    expect(s3.stageNumber).toBe(3);
    expect(s1.journeyId).toBe(journey.id);
    expect(s2.journeyId).toBe(journey.id);
    expect(s3.journeyId).toBe(journey.id);
  });

  it('rejects a duplicate stage number in the same journey', async () => {
    const { companyId } = await seedTenant(prisma, 'Journey Co');
    const driver = await prisma.driver.create({
      data: { name: 'Ace Driver', phone: '+27 82 000 0000', companyId, isActive: true },
    });
    const journey = await service.createJourney(companyId, {
      reference: 'J-2026-0004',
      driverId: driver.id,
    });

    await service.addStage(companyId, journey.id, {
      stageNumber: 1,
      type: 'PICKUP',
      locationName: 'Cape Town Depot',
    });

    await expect(
      service.addStage(companyId, journey.id, {
        stageNumber: 1,
        type: 'DELIVERY',
        locationName: 'Johannesburg Warehouse',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects adding a stage to a journey in another company', async () => {
    const { companyId } = await seedTenant(prisma, 'Journey Co');
    const { companyId: otherCompanyId } = await seedTenant(prisma, 'Other Co');
    const driver = await prisma.driver.create({
      data: { name: 'Ace Driver', phone: '+27 82 000 0000', companyId, isActive: true },
    });
    const journey = await service.createJourney(companyId, {
      reference: 'J-2026-0005',
      driverId: driver.id,
    });

    await expect(
      service.addStage(otherCompanyId, journey.id, {
        stageNumber: 1,
        type: 'PICKUP',
        locationName: 'Cape Town Depot',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sends a driver journey update with idempotency key', async () => {
    const { companyId } = await seedTenant(prisma, 'Journey Co');
    const driver = await prisma.driver.create({
      data: { name: 'Ace Driver', phone: '+27 82 000 0000', companyId, isActive: true },
    });
    const journey = await service.createJourney(companyId, {
      reference: 'J-2026-0006',
      driverId: driver.id,
    });

    const update = await service.sendUpdate(driver.id, companyId, journey.id, {
      type: 'DELAY',
      message: 'Running 30 min late due to roadworks',
      clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
      deviceOccurredAt: new Date('2026-11-01T10:00:00Z'),
    });

    expect(update.journeyId).toBe(journey.id);
    expect(update.driverId).toBe(driver.id);
    expect(update.companyId).toBe(companyId);
    expect(update.type).toBe('DELAY');
    expect(update.message).toBe('Running 30 min late due to roadworks');
    expect(update.clientMessageId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(update.status).toBe('PENDING');
    expect(update.deviceOccurredAt).not.toBeNull();
    expect(update.serverReceivedAt).not.toBeNull();
  });

  it('is idempotent: same clientMessageId returns the existing update', async () => {
    const { companyId } = await seedTenant(prisma, 'Journey Co');
    const driver = await prisma.driver.create({
      data: { name: 'Ace Driver', phone: '+27 82 000 0000', companyId, isActive: true },
    });
    const journey = await service.createJourney(companyId, {
      reference: 'J-2026-0007',
      driverId: driver.id,
    });

    const first = await service.sendUpdate(driver.id, companyId, journey.id, {
      type: 'DELAY',
      message: 'Running late',
      clientMessageId: '550e8400-e29b-41d4-a716-446655440001',
    });
    const second = await service.sendUpdate(driver.id, companyId, journey.id, {
      type: 'DELAY',
      message: 'Running late',
      clientMessageId: '550e8400-e29b-41d4-a716-446655440001',
    });

    expect(second.id).toBe(first.id);
    expect(second.message).toBe('Running late');
    const count = await prisma.journeyUpdate.count({
      where: { journeyId: journey.id, driverId: driver.id, clientMessageId: '550e8400-e29b-41d4-a716-446655440001' },
    });
    expect(count).toBe(1);
  });

  it('rejects a different message with the same idempotency key (409)', async () => {
    const { companyId } = await seedTenant(prisma, 'Journey Co');
    const driver = await prisma.driver.create({
      data: { name: 'Ace Driver', phone: '+27 82 000 0000', companyId, isActive: true },
    });
    const journey = await service.createJourney(companyId, {
      reference: 'J-2026-0008',
      driverId: driver.id,
    });

    await service.sendUpdate(driver.id, companyId, journey.id, {
      type: 'DELAY',
      message: 'Running late',
      clientMessageId: '550e8400-e29b-41d4-a716-446655440002',
    });

    await expect(
      service.sendUpdate(driver.id, companyId, journey.id, {
        type: 'VEHICLE_ISSUE',
        message: 'Flat tyre',
        clientMessageId: '550e8400-e29b-41d4-a716-446655440002',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an update from a driver not assigned to the journey', async () => {
    const { companyId } = await seedTenant(prisma, 'Journey Co');
    const driver = await prisma.driver.create({
      data: { name: 'Ace Driver', phone: '+27 82 000 0000', companyId, isActive: true },
    });
    const otherDriver = await prisma.driver.create({
      data: { name: 'Other Driver', phone: '+27 82 000 0001', companyId, isActive: true },
    });
    const journey = await service.createJourney(companyId, {
      reference: 'J-2026-0009',
      driverId: driver.id,
    });

    await expect(
      service.sendUpdate(otherDriver.id, companyId, journey.id, {
        type: 'DELAY',
        message: 'I am not assigned',
        clientMessageId: '550e8400-e29b-41d4-a716-446655440003',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('dispatcher acknowledges and resolves a driver update', async () => {
    const { companyId } = await seedTenant(prisma, 'Journey Co');
    const driver = await prisma.driver.create({
      data: { name: 'Ace Driver', phone: '+27 82 000 0000', companyId, isActive: true },
    });
    const journey = await service.createJourney(companyId, {
      reference: 'J-2026-0010',
      driverId: driver.id,
    });

    const update = await service.sendUpdate(driver.id, companyId, journey.id, {
      type: 'DELAY',
      message: 'Running 30 min late',
      clientMessageId: '550e8400-e29b-41d4-a716-446655440004',
    });

    expect(update.status).toBe('PENDING');

    const acked = await service.acknowledgeUpdate(companyId, update.id, 'dispatcher-1');
    expect(acked.status).toBe('ACKNOWLEDGED');
    expect(acked.acknowledgedBy).toBe('dispatcher-1');
    expect(acked.acknowledgedAt).not.toBeNull();

    const resolved = await service.resolveUpdate(companyId, update.id, 'dispatcher-1', 'Noted');
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resolutionNote).toBe('Noted');
  });

  it('tenant isolation: company B cannot see company A journeys', async () => {
    const { companyId: companyA } = await seedTenant(prisma, 'Co A');
    const { companyId: companyB } = await seedTenant(prisma, 'Co B');
    const driver = await prisma.driver.create({
      data: { name: 'Ace Driver', phone: '+27 82 000 0000', companyId: companyA, isActive: true },
    });

    await service.createJourney(companyA, {
      reference: 'J-A-001',
      driverId: driver.id,
    });

    const journeys = await service.listJourneys(companyB);
    expect(journeys).toHaveLength(0);

    await expect(
      service.getJourney(companyB, (await service.listJourneys(companyA))[0].id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getJourney returns stages and recent updates', async () => {
    const { companyId } = await seedTenant(prisma, 'Journey Co');
    const driver = await prisma.driver.create({
      data: { name: 'Ace Driver', phone: '+27 82 000 0000', companyId, isActive: true },
    });
    const journey = await service.createJourney(companyId, {
      reference: 'J-2026-0011',
      driverId: driver.id,
    });

    await service.addStage(companyId, journey.id, {
      stageNumber: 1,
      type: 'PICKUP',
      locationName: 'Cape Town Depot',
    });

    await service.sendUpdate(driver.id, companyId, journey.id, {
      type: 'DELAY',
      message: 'Running late',
      clientMessageId: '550e8400-e29b-41d4-a716-446655440005',
    });

    const journeyWithDetails = await service.getJourney(companyId, journey.id);

    expect(journeyWithDetails.stages).toHaveLength(1);
    expect(journeyWithDetails.stages[0].type).toBe('PICKUP');
    expect(journeyWithDetails.updates).toHaveLength(1);
    expect(journeyWithDetails.updates[0].type).toBe('DELAY');
    expect(journeyWithDetails.driver.name).toBe('Ace Driver');
  });
});
