import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/**
 * NOTIFICATIONS — the in-app notification centre.
 *
 * The schema is explicit about what a notification is for:
 *
 *   // null = broadcast to whole company
 *   userId String?
 *
 * So a row is either addressed to one person or to everyone. The service
 * ignores that distinction: findAll accepts a userId and never puts it in the
 * WHERE, and markAllRead marks the whole company read regardless of who is
 * asking. Today every writer leaves userId null, so the column is unused —
 * which is exactly why this has not bitten yet, and why it will bite as soon
 * as anything targets a user.
 */

const COMPANY = 'co-1';
const OTHER = 'co-2';
const ME = 'user-me';
const COLLEAGUE = 'user-colleague';

function makePrisma(seed: any[] = []) {
  const rows: any[] = seed.map((r, i) => ({
    id: `n-${i + 1}`,
    read: false,
    readAt: null,
    userId: null,
    ...r,
  }));

  // Resolve a Prisma-style where, including the OR list the service should use.
  // A Prisma where is a conjunction, with OR as one of its terms. The first
  // version of this helper returned as soon as it saw an OR and silently
  // dropped `id` and `companyId`, which made tenant isolation untestable.
  const matches = (row: any, where: any) => {
    if (!where) return true;
    const { OR, ...rest } = where;
    const plain = (w: any) =>
      Object.entries(w).every(([k, v]) => (row as any)[k] === v);
    if (!plain(rest)) return false;
    if (OR) return OR.some(plain);
    return true;
  };

  const notification = {
    findMany: jest.fn(async ({ where }: any) => rows.filter((r) => matches(r, where))),
    findFirst: jest.fn(async ({ where }: any) => rows.find((r) => matches(r, where)) ?? null),
    updateMany: jest.fn(async ({ where, data }: any) => {
      let n = 0;
      for (const r of rows) {
        if (matches(r, where)) {
          Object.assign(r, data);
          n += 1;
        }
      }
      return { count: n };
    }),
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `n-${rows.length + 1}`, read: false, userId: null, ...data };
      rows.push(row);
      return { ...row };
    }),
  };

  return {
    notification,
    __rows: rows,
    prisma: { notification } as any,
  };
}

const build = (prisma: any) =>
  new NotificationsService(
    prisma,
    { send: jest.fn(async () => undefined) } as any,
    { get: jest.fn((_k: string, d?: any) => d) } as any,
    { enqueue: jest.fn(async () => undefined) } as any,
    { sendMessage: jest.fn(async () => undefined) } as any,
  );

describe('NotificationsService — a notification addressed to someone else', () => {
  const seed = [
    { id: 'n-broadcast', companyId: COMPANY, userId: null, title: 'Depot closed' },
    { id: 'n-mine', companyId: COMPANY, userId: ME, title: 'Your invoice is due' },
    { id: 'n-theirs', companyId: COMPANY, userId: COLLEAGUE, title: 'Your driver is late' },
  ];

  it('shows broadcasts to everyone', async () => {
    const { prisma } = makePrisma(seed);
    const out = await build(prisma).findAll(ME, COMPANY);
    expect(out.map((n: any) => n.id)).toContain('n-broadcast');
  });

  it('shows a notification addressed to me', async () => {
    const { prisma } = makePrisma(seed);
    const out = await build(prisma).findAll(ME, COMPANY);
    expect(out.map((n: any) => n.id)).toContain('n-mine');
  });

  it('does not show a notification addressed to a colleague', async () => {
    // FAILED BEFORE: `where: { companyId }`. findAll takes a userId and never
    // uses it, so a notification meant for one person is served to every user
    // in the company.
    const { prisma } = makePrisma(seed);
    const out = await build(prisma).findAll(ME, COMPANY);
    expect(out.map((n: any) => n.id)).not.toContain('n-theirs');
  });

  it('does not mark all read clear a colleague’s notification', async () => {
    // FAILED BEFORE: `updateMany({ where: { companyId, read: false } })` — one
    // person clicking "mark all read" cleared every unread notification in the
    // company, including ones addressed to other people.
    const h = makePrisma(seed);
    await build(h.prisma).markAllRead(COMPANY, ME);
    expect(h.__rows.find((r) => r.id === 'n-theirs').read).toBe(false);
  });

  it('marks all read does clear broadcasts', async () => {
    const h = makePrisma(seed);
    await build(h.prisma).markAllRead(COMPANY, ME);
    expect(h.__rows.find((r) => r.id === 'n-broadcast').read).toBe(true);
  });

  it('refuses to mark a colleague’s notification read', async () => {
    const h = makePrisma(seed);
    await expect(build(h.prisma).markRead('n-theirs', COMPANY, ME)).rejects.toThrow(NotFoundException);
    expect(h.__rows.find((r) => r.id === 'n-theirs').read).toBe(false);
  });

  it('can mark a broadcast read', async () => {
    const h = makePrisma(seed);
    await build(h.prisma).markRead('n-broadcast', COMPANY, ME);
    expect(h.__rows.find((r) => r.id === 'n-broadcast').read).toBe(true);
  });
});

describe('NotificationsService — tenant isolation', () => {
  it('does not list another tenant’s notifications', async () => {
    const { prisma } = makePrisma([{ id: 'n-other', companyId: OTHER, userId: null }]);
    const out = await build(prisma).findAll(ME, COMPANY);
    expect(out).toHaveLength(0);
  });

  it('does not mark another tenant’s notification read', async () => {
    const h = makePrisma([{ id: 'n-other', companyId: OTHER, userId: null, read: false }]);
    await expect(build(h.prisma).markRead('n-other', COMPANY, ME)).rejects.toThrow(NotFoundException);
    expect(h.__rows[0].read).toBe(false);
  });

  it('does not clear another tenant’s notifications on mark all read', async () => {
    const h = makePrisma([{ id: 'n-other', companyId: OTHER, userId: null, read: false }]);
    await build(h.prisma).markAllRead(COMPANY, ME);
    expect(h.__rows[0].read).toBe(false);
  });
});
