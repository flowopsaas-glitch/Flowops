import { UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { WhatsAppService } from './whatsapp.service';

/**
 * WHATSAPP — Meta Cloud API webhook + outbound messaging.
 *
 * This is the one module in the codebase that takes an unauthenticated POST
 * from the public internet and turns it into database writes and, via the AI
 * inbox, into real collections. Three things matter: the signature is checked,
 * a retried delivery is not processed twice, and no write crosses a tenant.
 */

const COMPANY = 'co-1';
const OTHER = 'co-2';
const SECRET = 'test-app-secret';

const sign = (body: string, secret: string) =>
  `sha256=${createHmac('sha256', secret).update(Buffer.from(body)).digest('hex')}`;

/** A Meta webhook envelope carrying one inbound text message. */
function inboundEnvelope(wabaId: string, from = '27820000000', text = 'Please collect a parcel from 12 Main Road') {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: 'phone-1' },
              messages: [{ id: wabaId, from, type: 'text', text: { body: text } }],
            },
          },
        ],
      },
    ],
  };
}

function makeHarness(opts: { secret?: string; tenantHasCreds?: boolean } = {}) {
  const appSecret = opts.secret ?? SECRET;
  const tenantHasCreds = opts.tenantHasCreds ?? true;

  const messages: any[] = [];
  const threads: any[] = [];
  const notifications: any[] = [];
  const collectionsCreated: any[] = [];
  const tenants: string[] = [];
  let seq = 0;

  const whatsAppMessage = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `msg-${++seq}`, ...data };
      messages.push(row);
      return { ...row };
    }),
    findFirst: jest.fn(async ({ where }: any) => {
      if (!where?.wabaMessageId) return null;
      return messages.find((m) => m.wabaMessageId === where.wabaMessageId) ?? null;
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      // Resolve a nested filter one level deep, e.g. `thread: { companyId }`,
      // which is how a message is scoped to a tenant.
      const matches = (m: any, w: any) =>
        Object.entries(w ?? {}).every(([k, v]) => {
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            return m[k] && Object.entries(v).every(([k2, v2]) => m[k][k2] === v2);
          }
          return m[k] === v;
        });
      let n = 0;
      for (const m of messages) {
        if (matches(m, where)) {
          Object.assign(m, data);
          n += 1;
        }
      }
      return { count: n };
    }),
  };

  const whatsAppThread = {
    upsert: jest.fn(async ({ where, create, update }: any) => {
      const k = where.phone_companyId;
      const found = threads.find((t) => t.phone === k.phone && t.companyId === k.companyId);
      if (found) {
        Object.assign(found, update ?? {});
        return { ...found };
      }
      const row = { id: `thread-${threads.length + 1}`, unreadCount: 0, ...create };
      threads.push(row);
      return { ...row };
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const t = threads.find((x) => x.id === where.id);
      if (!t) throw new Error('thread not found');
      for (const [k, v] of Object.entries<any>(data)) {
        if (v && typeof v === 'object' && 'increment' in v) {
          t[k] = (Number(t[k]) || 0) + Number((v as any).increment);
        } else {
          t[k] = v;
        }
      }
      return { ...t };
    }),
  };

  const prisma: any = {
    whatsAppMessage,
    whatsAppThread,
    notification: { create: jest.fn(async ({ data }: any) => { notifications.push(data); return { ...data }; }) },
    company: { findFirst: jest.fn(async () => ({ id: COMPANY })) },
    withTenant: jest.fn(async (companyId: string, fn: any) => {
      tenants.push(companyId);
      return fn(prisma);
    }),
    __messages: messages,
    __threads: threads,
    __notifications: notifications,
    __tenants: tenants,
  };

  const config: any = { get: jest.fn((k: string, d?: any) => (k === 'WHATSAPP_APP_SECRET' ? appSecret : d)) };

  const creds: any = {
    resolveCompanyByRef: jest.fn(async () => COMPANY),
    getDecrypted: jest.fn(async () => ({ secrets: { appSecret } })),
    anyConfigured: jest.fn(async () => tenantHasCreds),
  };

  const inboxAi: any = {
    analyzeMessage: jest.fn(async () => ({ isCollectionRequest: true, confidence: 90, pickupAddress: '12 Main Road' })),
    autoCreateCollection: jest.fn(async (companyId: string) => {
      const id = `col-${collectionsCreated.length + 1}`;
      collectionsCreated.push({ id, companyId });
      return { id };
    }),
    buildConfirmationReply: jest.fn(() => 'Thanks, booked.'),
  };

  return {
    prisma,
    config,
    creds,
    inboxAi,
    collectionsCreated,
    svc: new WhatsAppService(prisma, config, creds, inboxAi),
  };
}

describe('WhatsAppService — webhook signature', () => {
  it('accepts a correctly signed webhook', async () => {
    const h = makeHarness();
    const body = JSON.stringify(inboundEnvelope('waba-1'));
    const out = await h.svc.handleWebhookEvent(JSON.parse(body), Buffer.from(body), sign(body, SECRET));
    expect(out).toEqual({ received: true });
  });

  it('rejects a badly signed webhook', async () => {
    const h = makeHarness();
    const body = JSON.stringify(inboundEnvelope('waba-1'));
    await expect(
      h.svc.handleWebhookEvent(JSON.parse(body), Buffer.from(body), sign(body, 'wrong-secret')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects the webhook when no app secret is configured, rather than trusting it', async () => {
    // FAILED BEFORE: the code verified the signature only `if (appSecret)`. With
    // no secret it logged a warning and carried on, so any unauthenticated POST
    // to this endpoint was accepted as a genuine Meta event — writing inbound
    // messages into a tenant's inbox and, through the AI inbox, creating real
    // collections. An unconfigured secret must close the door, not hold it open.
    const h = makeHarness({ secret: '', tenantHasCreds: false });
    const body = JSON.stringify(inboundEnvelope('waba-1'));

    await expect(
      h.svc.handleWebhookEvent(JSON.parse(body), Buffer.from(body), 'sha256=anything'),
    ).rejects.toThrow(UnauthorizedException);

    expect(h.prisma.__messages).toHaveLength(0);
    expect(h.collectionsCreated).toHaveLength(0);
  });

  it('stores no message at all when the signature fails', async () => {
    const h = makeHarness();
    const body = JSON.stringify(inboundEnvelope('waba-1'));
    await expect(
      h.svc.handleWebhookEvent(JSON.parse(body), Buffer.from(body), 'sha256=deadbeef'),
    ).rejects.toThrow(UnauthorizedException);
    expect(h.prisma.__messages).toHaveLength(0);
  });
});

describe('WhatsAppService — a retried delivery is processed once', () => {
  const deliver = async (h: any, wabaId: string) => {
    const body = JSON.stringify(inboundEnvelope(wabaId));
    await h.svc.handleWebhookEvent(JSON.parse(body), Buffer.from(body), sign(body, SECRET));
  };

  it('does not store the same inbound message twice', async () => {
    // FAILED BEFORE: no check on wabaMessageId, and no unique constraint behind
    // it. Meta retries a webhook until it gets a 200, so one customer message
    // arrived twice, twice again, and so on.
    const h = makeHarness();
    await deliver(h, 'waba-same');
    await deliver(h, 'waba-same');

    expect(h.prisma.__messages).toHaveLength(1);
  });

  it('does not create a second collection from a retried request', async () => {
    // The expensive consequence. One "please collect" message, delivered twice,
    // produced two collections: two jobs on the dispatch board and two invoices
    // for one pickup.
    const h = makeHarness();
    await deliver(h, 'waba-same');
    await deliver(h, 'waba-same');

    expect(h.collectionsCreated).toHaveLength(1);
  });

  it('does not double-count unread on a retry', async () => {
    const h = makeHarness();
    await deliver(h, 'waba-same');
    await deliver(h, 'waba-same');

    expect(h.prisma.__threads[0].unreadCount).toEqual(1);
  });

  it('still stores genuinely different messages', async () => {
    const h = makeHarness();
    await deliver(h, 'waba-a');
    await deliver(h, 'waba-b');

    expect(h.prisma.__messages).toHaveLength(2);
    expect(h.collectionsCreated).toHaveLength(2);
  });
});

describe('WhatsAppService — status updates stay inside the tenant', () => {
  const statusEnvelope = (wabaId: string, status: string) => ({
    entry: [{ changes: [{ value: { metadata: { phone_number_id: 'phone-1' }, statuses: [{ id: wabaId, status }] } }] }],
  });

  it('marks the matching message delivered', async () => {
    const h = makeHarness();
    h.prisma.__messages.push({ id: 'msg-1', wabaMessageId: 'waba-1', status: 'sent', thread: { companyId: COMPANY } });

    const body = JSON.stringify(statusEnvelope('waba-1', 'delivered'));
    await h.svc.handleWebhookEvent(JSON.parse(body), Buffer.from(body), sign(body, SECRET));

    expect(h.prisma.__messages[0].status).toEqual('delivered');
  });

  it('cannot rewrite another tenant’s message status', async () => {
    // FAILED BEFORE: `updateMany({ where: { wabaMessageId } })` with no
    // companyId, so any caller who knew or guessed a waba message id could move
    // another company's message to "read" or "failed".
    const h = makeHarness();
    h.prisma.__messages.push({ id: 'msg-1', wabaMessageId: 'waba-1', status: 'sent', thread: { companyId: OTHER } });

    const body = JSON.stringify(statusEnvelope('waba-1', 'read'));
    await h.svc.handleWebhookEvent(JSON.parse(body), Buffer.from(body), sign(body, SECRET));

    expect(h.prisma.__messages[0].status).toEqual('sent');
  });
});
