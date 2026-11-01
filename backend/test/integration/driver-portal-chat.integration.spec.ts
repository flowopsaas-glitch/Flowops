/**
 * Driver-portal chat, end to end against a real (in CI: PostgreSQL) database.
 *
 * Covers the dispatch→driver and driver→dispatch write paths with the real
 * Prisma client, so row locks, unique-constraint races and cascades are
 * exercised — things the in-memory unit-test double cannot prove.
 *
 * Prerequisites (CI provides both):
 *   1. `npx prisma generate` — writes node_modules/.prisma/client
 *   2. A PostgreSQL database — `resolveIntegrationDatabaseUrl()` from test/integration/support/env
 *
 * Run with:  npm run test:integration
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { DriverPortalService } from '../../src/driver-portal/driver-portal.service';
import { createIntegrationDatabase, type IntegrationDatabase } from './support/prisma-client';
import { seedTenant, truncateAll } from './support/db';

jest.setTimeout(90_000);

describe('DriverPortalService chat (PostgreSQL)', () => {
  let db: IntegrationDatabase;
  let prisma: PrismaClient;
  let service: DriverPortalService;

  // Non-Prisma dependencies are stubbed — this suite tests the chat write
  // path against the real database, not the notification layer.
  const notifications = { send: jest.fn().mockResolvedValue(undefined) };
  const gateway = { emit: jest.fn() };
  const safety = { report: jest.fn().mockResolvedValue(undefined) };
  const epod = { capture: jest.fn().mockResolvedValue(undefined) };
  const compliance = { check: jest.fn().mockResolvedValue({ ok: true }) };
  const audit = { write: jest.fn().mockResolvedValue(undefined) };
  const outbox = { publish: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    db = await createIntegrationDatabase();
    prisma = db.prisma;
    service = new DriverPortalService(
      prisma as any,
      notifications as any,
      gateway as any,
      safety as any,
      epod as any,
      compliance as any,
      audit as any,
      outbox as any,
    );
    await truncateAll(prisma);
  });

  afterEach(async () => {
    await db.shutdown();
  });

  it('dispatchSend creates a tenant-scoped message with a clientMessageId', async () => {
    const { companyId } = await seedTenant(prisma, 'Chat Co');
    const driver = await prisma.driver.create({
      data: { name: 'Ace Driver', companyId, isActive: true },
    });

    const result = await service.dispatchSend(driver.id, companyId, 'Running 10 min late', 'key-1');

    expect(result.driverId).toBe(driver.id);
    expect(result.companyId).toBe(companyId);
    expect(result.senderType).toBe('dispatch');
    expect(result.message).toBe('Running 10 min late');
    expect(result.clientMessageId).toBe('key-1');
    expect(result.deliveredAt).toBeNull();
    expect(result.readAt).toBeNull();
  });

  it('dispatchSend is idempotent: same key returns the existing message', async () => {
    const { companyId } = await seedTenant(prisma, 'Chat Co');
    const driver = await prisma.driver.create({
      data: { name: 'Ace Driver', companyId, isActive: true },
    });

    const first = await service.dispatchSend(driver.id, companyId, 'Hello', 'key-1');
    const second = await service.dispatchSend(driver.id, companyId, 'Hello', 'key-1');

    expect(second.id).toBe(first.id);
    expect(second.message).toBe('Hello');
    // Only one row in the database despite two calls.
    const count = await prisma.driverChatMessage.count({
      where: { driverId: driver.id, companyId, clientMessageId: 'key-1' },
    });
    expect(count).toBe(1);
  });

  it('dispatchSend rejects a different message with the same key (409)', async () => {
    const { companyId } = await seedTenant(prisma, 'Chat Co');
    const driver = await prisma.driver.create({
      data: { name: 'Ace Driver', companyId, isActive: true },
    });

    await service.dispatchSend(driver.id, companyId, 'Hello', 'key-1');
    await expect(
      service.dispatchSend(driver.id, companyId, 'Goodbye', 'key-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('dispatchSend is tenant-scoped: unknown company throws NotFound', async () => {
    const { companyId } = await seedTenant(prisma, 'Chat Co');
    const driver = await prisma.driver.create({
      data: { name: 'Ace Driver', companyId, isActive: true },
    });

    await expect(
      service.dispatchSend(driver.id, 'other-company', 'Hello', 'key-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('markAsDelivered sets deliveredAt on dispatch→driver messages only', async () => {
    const { companyId } = await seedTenant(prisma, 'Chat Co');
    const driver = await prisma.driver.create({
      data: { name: 'Ace Driver', companyId, isActive: true },
    });

    const sent = await service.dispatchSend(driver.id, companyId, 'Ping', 'key-1');
    await service.markAsDelivered(driver.id, companyId, [sent.id]);

    const refreshed = await prisma.driverChatMessage.findUnique({ where: { id: sent.id } });
    expect(refreshed?.deliveredAt).not.toBeNull();
    expect(refreshed?.readAt).toBeNull();
  });

  it('markAsDelivered ignores messages that do not belong to the tenant', async () => {
    const { companyId } = await seedTenant(prisma, 'Chat Co');
    const { companyId: otherCompanyId } = await seedTenant(prisma, 'Other Co');
    const driver = await prisma.driver.create({
      data: { name: 'Ace Driver', companyId, isActive: true },
    });

    const sent = await service.dispatchSend(driver.id, companyId, 'Ping', 'key-1');
    const result = await service.markAsDelivered(driver.id, otherCompanyId, [sent.id]);

    expect(result.marked).toBe(0);
    const refreshed = await prisma.driverChatMessage.findUnique({ where: { id: sent.id } });
    expect(refreshed?.deliveredAt).toBeNull();
  });

  it('markRead bulk-marks unread dispatch messages for a driver', async () => {
    const { companyId } = await seedTenant(prisma, 'Chat Co');
    const driver = await prisma.driver.create({
      data: { name: 'Ace Driver', companyId, isActive: true },
    });

    await service.dispatchSend(driver.id, companyId, 'One', 'key-1');
    await service.dispatchSend(driver.id, companyId, 'Two', 'key-2');

    const result = await service.markRead(driver.id);

    expect(result.marked).toBe(2);
    const unread = await prisma.driverChatMessage.count({
      where: { driverId: driver.id, senderType: 'dispatch', readAt: null },
    });
    expect(unread).toBe(0);
  });

  it('getDriverConversations returns drivers with unread count and last message', async () => {
    const { companyId } = await seedTenant(prisma, 'Chat Co');
    const driver = await prisma.driver.create({
      data: { name: 'Ace Driver', companyId, isActive: true },
    });

    await service.dispatchSend(driver.id, companyId, 'Hello dispatch', 'key-1');
    await service.dispatchSend(driver.id, companyId, 'Running late', 'key-2');

    const conversations = await service.getDriverConversations(companyId);

    expect(conversations).toHaveLength(1);
    expect(conversations[0].driverId).toBe(driver.id);
    expect(conversations[0].name).toBe('Ace Driver');
    expect(conversations[0].unreadCount).toBe(2);
    expect(conversations[0].lastMessage).toBe('Running late');
  });

  it('sendMessage from driver is stored with senderType=driver', async () => {
    const { companyId } = await seedTenant(prisma, 'Chat Co');
    const driver = await prisma.driver.create({
      data: { name: 'Ace Driver', companyId, isActive: true },
    });

    const result = await service.sendMessage(driver.id, companyId, 'At the border', 'driver');

    expect(result.senderType).toBe('driver');
    expect(result.message).toBe('At the border');
    expect(result.driverId).toBe(driver.id);
    expect(result.companyId).toBe(companyId);
  });

  it('tenant isolation: company B cannot read company A driver conversations', async () => {
    const { companyId: companyA } = await seedTenant(prisma, 'Co A');
    const { companyId: companyB } = await seedTenant(prisma, 'Co B');
    const driver = await prisma.driver.create({
      data: { name: 'Ace Driver', companyId: companyA, isActive: true },
    });

    await service.dispatchSend(driver.id, companyA, 'Secret', 'key-1');

    const conversations = await service.getDriverConversations(companyB);
    expect(conversations).toHaveLength(0);

    await expect(
      service.dispatchSend(driver.id, companyB, 'Should fail', 'key-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
