import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingPortalService } from './booking-portal.service';
import { BookingPortalLinkResolver } from './booking-portal-link.resolver';

/**
 * Booking portal — the domain rules.
 *
 * The plumbing (CRUD shape, field mapping) would be caught by a type error.
 * What is worth pinning here is the part that is a security property rather
 * than a feature:
 *
 *   1. a request is invisible to every tenant except its own, even by id;
 *   2. the public surface derives tenancy from the link, never from the body;
 *   3. a revoked or expired link stops working for reads as well as writes;
 *   4. a decided request cannot be decided again.
 *
 * `booking_requests` shipped with no tenant column of its own, so (1) and (2)
 * are the two that turn a shareable URL from a leak into a feature.
 */

const COMPANY = 'cmp-a';
const OTHER = 'cmp-b';

const LINK = {
  id: 'link-1',
  token: 'tok-active',
  label: 'Website enquiries',
  isActive: true,
  expiresAt: null as Date | null,
  companyId: COMPANY,
  company: {
    id: COMPANY,
    name: 'Acme Freight',
    brandName: 'Acme',
    logoUrl: null,
    primaryColor: '#123456',
    phone: '+27 10 000 0000',
  },
};

const SUBMIT = {
  senderName: 'Sender One',
  senderPhone: '0820000000',
  senderAddress: '1 Origin Street, Johannesburg',
  recipientName: 'Recipient One',
  recipientPhone: '0820000001',
  recipientAddress: '2 Destination Road, Gaborone',
  notes: 'Fragile',
};

/**
 * An in-memory Prisma that enforces tenant scoping the way the database would.
 *
 * Scoping is implemented here rather than asserted after the fact: a mock that
 * ignored companyId would let a leak pass every test in this file.
 */
function makePrisma(overrides: Record<string, unknown> = {}) {
  const state = {
    links: [{ ...LINK }] as any[],
    requests: [] as any[],
    nextId: 1,
  };

  const scopeLinks = (where: any = {}) =>
    state.links.filter((l) => {
      if (where.id && l.id !== where.id) return false;
      if (where.token && l.token !== where.token) return false;
      if (where.companyId && l.companyId !== where.companyId) return false;
      if (where.isActive !== undefined && l.isActive !== where.isActive) return false;
      return true;
    });

  const scopeRequests = (where: any = {}) =>
    state.requests.filter((r) => {
      if (where.id && r.id !== where.id) return false;
      if (where.companyId && r.companyId !== where.companyId) return false;
      if (where.linkId && r.linkId !== where.linkId) return false;
      if (typeof where.status === 'string' && r.status !== where.status) return false;
      return true;
    });

  const api = {
    _state: state,
    bookingPortalLink: {
      findMany: jest.fn(async ({ where }: any) => scopeLinks(where)),
      findFirst: jest.fn(async ({ where }: any) => scopeLinks(where)[0] ?? null),
      findUnique: jest.fn(async ({ where }: any) => scopeLinks(where)[0] ?? null),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `link-${state.nextId++}`, isActive: true, expiresAt: null, ...data };
        state.links.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = scopeLinks(where)[0];
        Object.assign(row, data);
        return row;
      }),
    },
    bookingRequest: {
      findFirst: jest.fn(async ({ where }: any) => scopeRequests(where)[0] ?? null),
      findMany: jest.fn(async ({ where, take, skip }: any) => {
        const rows = scopeRequests(where);
        return rows.slice(skip ?? 0, (skip ?? 0) + (take ?? rows.length));
      }),
      count: jest.fn(async ({ where }: any) => scopeRequests(where).length),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `req-${state.nextId++}`, createdAt: new Date(), ...data };
        state.requests.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = scopeRequests(where)[0];
        Object.assign(row, data);
        return row;
      }),
    },
  };

  /**
   * `withTenant` opens a transaction, sets app.company_id and hands the
   * callback a client. The delegates are shared with the unscoped path, so
   * scoping behaviour is identical — what is under test here is that the
   * service routes through it at all, and that an empty tenant is refused
   * rather than quietly proceeding with isolation off.
   */
  (api as any).withTenant = jest.fn(async (companyId: string, fn: any) => {
    if (typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error(
        `withTenant requires a non-empty companyId, received ${JSON.stringify(companyId)}`,
      );
    }
    return fn(api);
  });

  return Object.assign(api, overrides) as any;
}

/** The service under test, with a real resolver over the same mock prisma. */
function makeService(prisma: any) {
  return new BookingPortalService(prisma, new BookingPortalLinkResolver(prisma));
}

/** Seed one request belonging to COMPANY unless told otherwise. */
function seedRequest(prisma: any, over: Record<string, unknown> = {}) {
  const row = {
    id: 'req-1',
    companyId: COMPANY,
    linkId: LINK.id,
    status: 'pending',
    notes: null as string | null,
    ...SUBMIT,
    ...over,
  };
  prisma._state.requests.push(row);
  return row;
}

describe('BookingPortalService — tenant surface', () => {
  it('scopes link list to the calling company', async () => {
    const prisma = makePrisma();
    prisma._state.links.push({ ...LINK, id: 'link-2', companyId: OTHER, token: 'tok-other' });
    const svc = makeService(prisma);

    const links = await svc.listLinks(COMPANY);

    expect(links.map((l: any) => l.id)).toEqual(['link-1']);
  });

  it('refuses to update another company’s link', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    await expect(svc.updateLink(OTHER, 'link-1', { label: 'x' })).rejects.toThrow(NotFoundException);
  });

  it('revokes without deleting the link or its requests', async () => {
    const prisma = makePrisma();
    seedRequest(prisma);
    const svc = makeService(prisma);

    await svc.revokeLink(COMPANY, 'link-1');

    expect(prisma._state.links[0].isActive).toBe(false);
    expect(prisma._state.requests).toHaveLength(1);
  });

  it('never returns another company’s request by id', async () => {
    const prisma = makePrisma();
    seedRequest(prisma);
    const svc = makeService(prisma);

    await expect(svc.getRequest(OTHER, 'req-1')).rejects.toThrow(NotFoundException);
  });

  it('excludes another company’s requests from the list and the total', async () => {
    const prisma = makePrisma();
    seedRequest(prisma);
    seedRequest(prisma, { id: 'req-2', companyId: OTHER });
    const svc = makeService(prisma);

    const page = await svc.listRequests(COMPANY, {});

    expect(page.items.map((r: any) => r.id)).toEqual(['req-1']);
    expect(page.total).toBe(1);
  });

  it('clamps take to the maximum rather than trusting the query', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    const page = await svc.listRequests(COMPANY, { take: 10_000 });

    expect(page.take).toBe(100);
  });
});

describe('BookingPortalService — request lifecycle', () => {
  it('moves a pending request to accepted', async () => {
    const prisma = makePrisma();
    seedRequest(prisma);
    const svc = makeService(prisma);

    const result = await svc.transitionRequest(COMPANY, 'req-1', { status: 'accepted' });

    expect(result.status).toBe('accepted');
  });

  it('refuses to decide a request twice', async () => {
    const prisma = makePrisma();
    seedRequest(prisma, { status: 'accepted' });
    const svc = makeService(prisma);

    await expect(
      svc.transitionRequest(COMPANY, 'req-1', { status: 'rejected' }),
    ).rejects.toThrow(ConflictException);
  });

  it('refuses to decide another company’s request', async () => {
    const prisma = makePrisma();
    seedRequest(prisma);
    const svc = makeService(prisma);

    await expect(
      svc.transitionRequest(OTHER, 'req-1', { status: 'accepted' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('appends a decision note instead of replacing the customer’s', async () => {
    const prisma = makePrisma();
    seedRequest(prisma, { notes: 'Fragile' });
    const svc = makeService(prisma);

    const result = await svc.transitionRequest(COMPANY, 'req-1', {
      status: 'rejected',
      note: 'outside service area',
    });

    expect(result.notes).toContain('Fragile');
    expect(result.notes).toContain('[rejected] outside service area');
  });
});

describe('BookingPortalService — public surface', () => {
  it('resolves an active link to branding only', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    const view = await svc.resolvePublicLink('tok-active');

    expect(view).toEqual({
      label: 'Website enquiries',
      company: { name: 'Acme', logo: null, color: '#123456', phone: '+27 10 000 0000' },
    });
    // A visitor must not receive tenant identifiers or the request list.
    expect(JSON.stringify(view)).not.toContain(COMPANY);
  });

  it('derives the tenant from the link, not from anything the caller sent', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    await svc.submitPublicRequest('tok-active', { ...SUBMIT, companyId: OTHER } as any);

    expect(prisma._state.requests).toHaveLength(1);
    expect(prisma._state.requests[0].companyId).toBe(COMPANY);
  });

  it('rejects a revoked link for reads and writes alike', async () => {
    const prisma = makePrisma();
    prisma._state.links[0].isActive = false;
    const svc = makeService(prisma);

    await expect(svc.resolvePublicLink('tok-active')).rejects.toThrow(NotFoundException);
    await expect(svc.submitPublicRequest('tok-active', SUBMIT)).rejects.toThrow(NotFoundException);
    expect(prisma._state.requests).toHaveLength(0);
  });

  it('rejects an expired link', async () => {
    const prisma = makePrisma();
    prisma._state.links[0].expiresAt = new Date(Date.now() - 60_000);
    const svc = makeService(prisma);

    await expect(svc.submitPublicRequest('tok-active', SUBMIT)).rejects.toThrow(NotFoundException);
  });

  it('accepts a link that expires in the future', async () => {
    const prisma = makePrisma();
    prisma._state.links[0].expiresAt = new Date(Date.now() + 60_000);
    const svc = makeService(prisma);

    await expect(svc.submitPublicRequest('tok-active', SUBMIT)).resolves.toMatchObject({
      status: 'pending',
    });
  });

  it('answers identically for an unknown token and a revoked one', async () => {
    const prisma = makePrisma();
    prisma._state.links[0].isActive = false;
    const svc = makeService(prisma);

    const unknown = await svc.resolvePublicLink('tok-does-not-exist').catch((e) => e);
    const revoked = await svc.resolvePublicLink('tok-active').catch((e) => e);

    // Probing must not distinguish "never existed" from "revoked".
    expect(unknown.constructor).toBe(revoked.constructor);
    expect(unknown.message).toBe(revoked.message);
  });

  it('issues a distinct, unguessable token per link', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    const a = await svc.createLink(COMPANY, {});
    const b = await svc.createLink(COMPANY, {});

    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(32);
  });
});

describe('BookingPortalService — tenant context', () => {
  it('runs tenant-surface reads inside withTenant', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    await svc.listLinks(COMPANY);

    expect(prisma.withTenant).toHaveBeenCalledWith(COMPANY, expect.any(Function));
  });

  it('runs the anonymous write inside the tenant the link resolved to', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    await svc.submitPublicRequest('tok-active', SUBMIT);

    // The public path has no session, but it is not the one path with no
    // tenant: the write is scoped to whichever company owns the link.
    expect(prisma.withTenant).toHaveBeenCalledWith(COMPANY, expect.any(Function));
  });

  it('refuses an empty tenant rather than running with isolation off', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    await expect(svc.listLinks('')).rejects.toThrow(/non-empty companyId/);
  });
});
