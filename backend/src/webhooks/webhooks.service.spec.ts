import { Test } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../prisma/prisma.service';

// ── Prisma mock factory ───────────────────────────────────────────────────────

function makePrisma() {
  return {
    webhookEndpoint: {
      findMany:   jest.fn().mockResolvedValue([]),
      findFirst:  jest.fn(),
      findUnique: jest.fn(),
      create:     jest.fn(),
      delete:     jest.fn(),
    },
    webhookDelivery: {
      create:  jest.fn().mockResolvedValue({ id: 'dlv1' }),
      update:  jest.fn().mockResolvedValue({ id: 'dlv1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
}

const mockFetch = (status: number, body = 'ok') => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(body),
  } as any);
};

describe('WebhooksService', () => {
  let svc: WebhooksService;
  let prisma: ReturnType<typeof makePrisma>;
  let app: any;

  beforeEach(async () => {
    prisma = makePrisma();
    // No ScheduleModule — avoid cron firing during test
    const module = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    app = module;
    svc = module.get(WebhooksService);
  });

  afterEach(async () => {
    await app?.close();
    jest.restoreAllMocks();
  });


  // ── dispatch ───────────────────────────────────────────────────────────────

  describe('dispatch', () => {
    it('skips delivery when no endpoints match', async () => {
      (prisma.webhookEndpoint.findMany as jest.Mock).mockResolvedValue([]);
      await svc.dispatch('co1', 'waybill.status_changed', {});
      expect(prisma.webhookDelivery.create).not.toHaveBeenCalled();
    });

    it('creates delivery record and marks DELIVERED on 2xx', async () => {
      (prisma.webhookEndpoint.findMany as jest.Mock).mockResolvedValue([
        { id: 'ep1', url: 'https://x.com/hook', secret: 'sec' },
      ]);
      mockFetch(200);
      await svc.dispatch('co1', 'waybill.status_changed', { status: 'DELIVERED' });
      expect(prisma.webhookDelivery.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }),
      );
      const upd = (prisma.webhookDelivery.update as jest.Mock).mock.calls[0][0];
      expect(upd.data.status).toBe('DELIVERED');
    });

    it('marks RETRYING and sets nextRetryAt on non-2xx', async () => {
      (prisma.webhookEndpoint.findMany as jest.Mock).mockResolvedValue([
        { id: 'ep1', url: 'https://x.com/hook', secret: 'sec' },
      ]);
      mockFetch(500);
      await svc.dispatch('co1', 'waybill.status_changed', {});
      const upd = (prisma.webhookDelivery.update as jest.Mock).mock.calls[0][0];
      expect(upd.data.status).toBe('RETRYING');
      expect(upd.data.nextRetryAt).toBeInstanceOf(Date);
    });

    it('marks RETRYING on network error', async () => {
      (prisma.webhookEndpoint.findMany as jest.Mock).mockResolvedValue([
        { id: 'ep1', url: 'https://x.com/hook', secret: 'sec' },
      ]);
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      await svc.dispatch('co1', 'waybill.status_changed', {});
      const upd = (prisma.webhookDelivery.update as jest.Mock).mock.calls[0][0];
      expect(upd.data.status).toBe('RETRYING');
    });
  });

  // ── retryDelay (static) ────────────────────────────────────────────────────

  describe('retryDelay (static)', () => {
    it.each([
      [1, 60_000],
      [2, 300_000],
      [3, 1_800_000],
      [4, 7_200_000],
      [5, 28_800_000],
    ])('attempt %i → %i ms', (attempt, expected) => {
      expect((WebhooksService as any).retryDelay(attempt)).toBe(expected);
    });
  });

  // ── retryDelivery (private, called via any cast) ───────────────────────────

  describe('retryDelivery', () => {
    const delivery = {
      id: 'dlv1', endpointId: 'ep1',
      payload: JSON.stringify({ event: 'waybill.status_changed', data: {} }),
      attempts: 1,
    };

    it('marks DELIVERED on 2xx response', async () => {
      (prisma.webhookEndpoint.findUnique as jest.Mock).mockResolvedValue(
        { url: 'https://x.com', secret: 's', active: true },
      );
      mockFetch(200);
      await (svc as any).retryDelivery(delivery);
      const upd = (prisma.webhookDelivery.update as jest.Mock).mock.calls[0][0];
      expect(upd.data.status).toBe('DELIVERED');
    });

    it('marks EXHAUSTED after 5 attempts', async () => {
      (prisma.webhookEndpoint.findUnique as jest.Mock).mockResolvedValue(
        { url: 'https://x.com', secret: 's', active: true },
      );
      mockFetch(503);
      await (svc as any).retryDelivery({ ...delivery, attempts: 4 });
      const upd = (prisma.webhookDelivery.update as jest.Mock).mock.calls[0][0];
      expect(upd.data.status).toBe('EXHAUSTED');
    });

    it('marks RETRYING (with nextRetryAt) before max attempts', async () => {
      (prisma.webhookEndpoint.findUnique as jest.Mock).mockResolvedValue(
        { url: 'https://x.com', secret: 's', active: true },
      );
      mockFetch(503);
      await (svc as any).retryDelivery({ ...delivery, attempts: 2 });
      const upd = (prisma.webhookDelivery.update as jest.Mock).mock.calls[0][0];
      expect(upd.data.status).toBe('RETRYING');
      expect(upd.data.nextRetryAt).toBeInstanceOf(Date);
    });

    it('immediately exhausts inactive endpoints', async () => {
      (prisma.webhookEndpoint.findUnique as jest.Mock).mockResolvedValue(
        { url: 'https://x.com', secret: 's', active: false },
      );
      await (svc as any).retryDelivery(delivery);
      const upd = (prisma.webhookDelivery.update as jest.Mock).mock.calls[0][0];
      expect(upd.data.status).toBe('EXHAUSTED');
    });
  });
});
