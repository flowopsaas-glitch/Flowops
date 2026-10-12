import { Test } from '@nestjs/testing';
import { OutboxService, EVENT_CATALOG, isKnownEvent, OutboxWriter } from './outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from './webhooks.service';

function makePrisma() {
  return {
    outboxEvent: {
      create:   jest.fn().mockResolvedValue({ id: 'ob1' }),
      findMany: jest.fn().mockResolvedValue([]),
      update:   jest.fn().mockResolvedValue({ id: 'ob1' }),
    },
  } as unknown as PrismaService;
}

function makeWebhooks() {
  return { dispatch: jest.fn().mockResolvedValue(undefined) } as unknown as WebhooksService;
}

describe('OutboxService', () => {
  let svc: OutboxService;
  let prisma: ReturnType<typeof makePrisma>;
  let webhooks: ReturnType<typeof makeWebhooks>;

  beforeEach(async () => {
    prisma = makePrisma();
    webhooks = makeWebhooks();
    const module = await Test.createTestingModule({
      providers: [
        OutboxService,
        { provide: PrismaService, useValue: prisma },
        { provide: WebhooksService, useValue: webhooks },
      ],
    }).compile();
    svc = module.get(OutboxService);
  });

  describe('event catalog', () => {
    it('knows the pre-existing waybill/return events (names are a public contract)', () => {
      expect(isKnownEvent('waybill.status_changed')).toBe(true);
      expect(isKnownEvent('return.status_changed')).toBe(true);
    });

    it('covers the rail slot lifecycle', () => {
      for (const e of ['rail.slot.created', 'rail.slot.allocated', 'rail.slot.rejected', 'rail.slot.operated']) {
        expect(isKnownEvent(e)).toBe(true);
      }
    });

    it('rejects unknown event names', () => {
      expect(isKnownEvent('rail.slot.made_up')).toBe(false);
      expect(EVENT_CATALOG.length).toBeGreaterThan(10);
    });
  });

  describe('enqueue', () => {
    it('writes the event with the JSON-serialised payload', async () => {
      const id = await svc.enqueue(prisma as unknown as OutboxWriter, 'c1', 'rail.slot.allocated', { applicationNumber: 'SA-2026-00042' });
      expect(id).toBe('ob1');
      expect(prisma.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          companyId: 'c1',
          event: 'rail.slot.allocated',
          payload: JSON.stringify({ applicationNumber: 'SA-2026-00042' }),
        },
        select: { id: true },
      });
    });

    it('works with a transaction client (same shape as the Prisma service)', async () => {
      const tx = { outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'tx1' }) } };
      const id = await svc.enqueue(tx as unknown as OutboxWriter, 'c1', 'rail.slot.created', {});
      expect(id).toBe('tx1');
    });

    it('returns null and never throws when the insert fails', async () => {
      (prisma.outboxEvent.create as jest.Mock).mockRejectedValueOnce(new Error('db down'));
      const id = await svc.enqueue(prisma as unknown as OutboxWriter, 'c1', 'rail.slot.created', {});
      expect(id).toBeNull();
    });
  });

  describe('drain', () => {
    it('dispatches due events and marks them PROCESSED', async () => {
      (prisma.outboxEvent.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'ob1', companyId: 'c1', event: 'rail.slot.allocated', payload: '{"a":1}', attempts: 0 },
      ]);
      await svc.drain();
      expect(webhooks.dispatch).toHaveBeenCalledWith('c1', 'rail.slot.allocated', { a: 1 });
      expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'ob1' },
        data: expect.objectContaining({ status: 'PROCESSED', attempts: 1 }),
      });
    });

    it('schedules a back-off retry when dispatch throws', async () => {
      (prisma.outboxEvent.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'ob2', companyId: 'c1', event: 'rail.slot.rejected', payload: '{}', attempts: 0 },
      ]);
      (webhooks.dispatch as jest.Mock).mockRejectedValueOnce(new Error('boom'));
      await svc.drain();
      expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'ob2' },
        data: expect.objectContaining({ status: 'RETRYING', attempts: 1, lastError: 'boom' }),
      });
    });

    it('marks the event EXHAUSTED after 5 attempts', async () => {
      (prisma.outboxEvent.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'ob3', companyId: 'c1', event: 'rail.slot.rejected', payload: '{}', attempts: 4 },
      ]);
      (webhooks.dispatch as jest.Mock).mockRejectedValueOnce(new Error('dead'));
      await svc.drain();
      expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'ob3' },
        data: expect.objectContaining({ status: 'EXHAUSTED', attempts: 5 }),
      });
    });

    it('does nothing when no events are due', async () => {
      await svc.drain();
      expect(webhooks.dispatch).not.toHaveBeenCalled();
      expect(prisma.outboxEvent.update).not.toHaveBeenCalled();
    });

    it('survives a lookup failure without throwing', async () => {
      (prisma.outboxEvent.findMany as jest.Mock).mockRejectedValueOnce(new Error('db gone'));
      await expect(svc.drain()).resolves.toBeUndefined();
    });
  });
});
