import { BadRequestException } from '@nestjs/common';
import {
  assessShareToken, DEFAULT_GATE_CUTOFF_HOURS, findGateConflicts, formatWindow,
  readGateCutoffHours, SHARE_TOKEN_TTL_DAYS, shareTokenExpiryFrom, validateGateWindow,
} from './rail-truck-gate.shared';

/**
 * Shared plumbing for the terminal gate layer.
 *
 * These helpers exist so that "inside the cut-off", "is this share link still
 * usable" and "which windows overlap" have exactly ONE definition, used by both
 * the appointments service and the window-change service. A second definition
 * in a second service is how a terminal ends up with two different answers to
 * the same question about the same truck.
 */

const T = (iso: string) => new Date(iso);
const NOW = T('2026-10-28T12:00:00.000Z');

// ── Cut-off ──────────────────────────────────────────────────────────────────

describe('readGateCutoffHours', () => {
  const prismaWith = (company: any) => ({
    company: { findUnique: jest.fn(async () => company) },
    terminalTruckAppointment: { findMany: jest.fn(async () => []) },
  });

  it('documents its default, because the default is what governs most tenants', () => {
    expect(DEFAULT_GATE_CUTOFF_HOURS).toBe(2);
  });

  it('returns the tenant setting when it is a sane non-negative number', () => {
    return expect(readGateCutoffHours(prismaWith({ terminalGateCutoffHours: 6 } as any), 'c1')).resolves.toBe(6);
  });

  it('a zero cut-off is a real setting and is NOT replaced by the default', async () => {
    // 0 means "every change is a late change". Silently turning it into 2 would
    // let ungoverned late changes through.
    await expect(readGateCutoffHours(prismaWith({ terminalGateCutoffHours: 0 } as any), 'c1')).resolves.toBe(0);
  });

  it('falls back to the default for a missing company, a null field, a negative or a non-numeric value', async () => {
    await expect(readGateCutoffHours(prismaWith(null), 'c1')).resolves.toBe(DEFAULT_GATE_CUTOFF_HOURS);
    await expect(readGateCutoffHours(prismaWith({ terminalGateCutoffHours: null } as any), 'c1')).resolves.toBe(2);
    await expect(readGateCutoffHours(prismaWith({} as any), 'c1')).resolves.toBe(2);
    await expect(readGateCutoffHours(prismaWith({ terminalGateCutoffHours: -1 } as any), 'c1')).resolves.toBe(2);
    await expect(readGateCutoffHours(prismaWith({ terminalGateCutoffHours: Number.NaN } as any), 'c1')).resolves.toBe(2);
    await expect(readGateCutoffHours(prismaWith({ terminalGateCutoffHours: '4' } as any), 'c1')).resolves.toBe(2);
  });

  it('asks for the tenant by id, so the cut-off cannot come from another company', async () => {
    const prisma = prismaWith({ terminalGateCutoffHours: 3 } as any);
    await readGateCutoffHours(prisma as any, 'company-7');
    expect(prisma.company.findUnique).toHaveBeenCalledWith({
      where: { id: 'company-7' }, select: { terminalGateCutoffHours: true },
    });
  });
});

// ── Window validation ────────────────────────────────────────────────────────

describe('validateGateWindow', () => {
  it('orders a valid window', () => {
    expect(validateGateWindow('2026-10-28T08:00:00.000Z', '2026-10-28T09:00:00.000Z')).toEqual({
      start: T('2026-10-28T08:00:00.000Z'), end: T('2026-10-28T09:00:00.000Z'),
    });
  });

  it('refuses an end that is not after the start, including a zero-length window', () => {
    expect(() => validateGateWindow('2026-10-28T09:00:00.000Z', '2026-10-28T08:00:00.000Z'))
      .toThrow(new BadRequestException('windowEnd must be after windowStart'));
    expect(() => validateGateWindow('2026-10-28T09:00:00.000Z', '2026-10-28T09:00:00.000Z'))
      .toThrow('windowEnd must be after windowStart');
  });

  it('refuses an unparseable date rather than storing an Invalid Date', () => {
    expect(() => validateGateWindow('yesterday', '2026-10-28T09:00:00.000Z')).toThrow('must be valid dates');
    expect(() => validateGateWindow('2026-10-28T08:00:00.000Z', '')).toThrow('must be valid dates');
  });

  it('throws a 400, not a 500 — a bad window is the caller\u2019s mistake', () => {
    try {
      validateGateWindow('nope', 'nope');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
    }
  });
});

// ── Conflicts ────────────────────────────────────────────────────────────────

describe('findGateConflicts', () => {
  const capture = () => {
    const calls: any[] = [];
    return {
      calls,
      prisma: {
        company: { findUnique: jest.fn(async () => null) },
        terminalTruckAppointment: {
          findMany: jest.fn(async (args: any) => { calls.push(args); return []; }),
        },
      },
    };
  };

  it('looks for a real overlap: starts before the new end AND ends after the new start', async () => {
    const { prisma, calls } = capture();
    await findGateConflicts(prisma as any, 'c1', 'Central Terminal', T('2026-10-28T10:00:00Z'), T('2026-10-28T11:00:00Z'));
    expect(calls[0].where).toMatchObject({
      companyId: 'c1',
      terminalName: { equals: 'Central Terminal', mode: 'insensitive' },
      windowStart: { lt: T('2026-10-28T11:00:00Z') },
      windowEnd: { gt: T('2026-10-28T10:00:00Z') },
    });
    // Only windows that can still be affected.
    expect(calls[0].where.status.in.sort()).toEqual(['ARRIVED', 'BOOKED', 'LOADING']);
  });

  it('back-to-back windows do not conflict: touching edges are not an overlap', async () => {
    const { prisma, calls } = capture();
    await findGateConflicts(prisma as any, 'c1', 'T', T('2026-10-28T10:00:00Z'), T('2026-10-28T11:00:00Z'));
    // A window that ends exactly when the new one starts is excluded by `gt`.
    expect(calls[0].where.windowEnd.gt).toEqual(T('2026-10-28T10:00:00Z'));
    // A window that starts exactly when the new one ends is excluded by `lt`.
    expect(calls[0].where.windowStart.lt).toEqual(T('2026-10-28T11:00:00Z'));
  });

  it('excludes the appointment being changed, so a truck never conflicts with itself', async () => {
    const { prisma, calls } = capture();
    await findGateConflicts(prisma as any, 'c1', 'T', NOW, T('2026-10-28T13:00:00Z'), 'appt-9');
    expect(calls[0].where.id).toEqual({ not: 'appt-9' });
  });

  it('without an exclusion, no id filter is added', async () => {
    const { prisma, calls } = capture();
    await findGateConflicts(prisma as any, 'c1', 'T', NOW, T('2026-10-28T13:00:00Z'));
    expect(calls[0].where.id).toBeUndefined();
  });

  it('is tenant-scoped and returns only what the terminal needs to judge the clash', async () => {
    const { prisma, calls } = capture();
    await findGateConflicts(prisma as any, 'c1', 'T', NOW, T('2026-10-28T13:00:00Z'));
    expect(calls[0].where.companyId).toBe('c1');
    expect(Object.keys(calls[0].select).sort()).toEqual(
      ['haulierName', 'id', 'status', 'vehicleReg', 'windowEnd', 'windowStart'],
    );
    expect(calls[0].orderBy).toEqual({ windowStart: 'asc' });
  });
});

// ── Share-token validity ─────────────────────────────────────────────────────

describe('assessShareToken', () => {
  it('a revoked or never-issued token is ABSENT', () => {
    expect(assessShareToken({ shareToken: null }, NOW)).toEqual({ state: 'ABSENT' });
    expect(assessShareToken({ shareToken: '' }, NOW)).toEqual({ state: 'ABSENT' });
    expect(assessShareToken({}, NOW)).toEqual({ state: 'ABSENT' });
  });

  it('a token with a future expiry is VALID and reports when it dies', () => {
    expect(assessShareToken({ shareToken: 'tok', shareTokenExpiresAt: T('2026-10-29T12:00:00Z') }, NOW)).toEqual({
      state: 'VALID', expiresAt: T('2026-10-29T12:00:00Z'),
    });
  });

  it('expiry is inclusive: a token expiring exactly now is already EXPIRED', () => {
    expect(assessShareToken({ shareToken: 'tok', shareTokenExpiresAt: NOW }, NOW)).toEqual({
      state: 'EXPIRED', expiredAt: NOW,
    });
    expect(assessShareToken({ shareToken: 'tok', shareTokenExpiresAt: new Date(NOW.getTime() - 1) }, NOW).state)
      .toBe('EXPIRED');
    expect(assessShareToken({ shareToken: 'tok', shareTokenExpiresAt: new Date(NOW.getTime() + 1) }, NOW).state)
      .toBe('VALID');
  });

  it('a LEGACY token with no recorded expiry is readable but is NOT valid', () => {
    // Three different consequences need three different answers: an expired
    // link is gone, a legacy link can still be read, and neither may confirm.
    const issued = T('2026-09-01T00:00:00Z');
    expect(assessShareToken({ shareToken: 'tok', shareTokenExpiresAt: null, shareTokenIssuedAt: issued }, NOW))
      .toEqual({ state: 'LEGACY_NO_EXPIRY', issuedAt: issued });
    expect(assessShareToken({ shareToken: 'tok' }, NOW)).toEqual({ state: 'LEGACY_NO_EXPIRY', issuedAt: null });
  });
});

describe('share-token lifetime', () => {
  it('documents the TTL, because a gate window is a same-week fact', () => {
    expect(SHARE_TOKEN_TTL_DAYS).toBe(7);
  });

  it('computes the expiry from the issue time', () => {
    expect(shareTokenExpiryFrom(T('2026-10-28T12:00:00Z'))).toEqual(T('2026-11-04T12:00:00Z'));
    expect(shareTokenExpiryFrom(T('2026-10-28T12:00:00Z'), 1)).toEqual(T('2026-10-29T12:00:00Z'));
    expect(shareTokenExpiryFrom(T('2026-10-28T12:00:00Z'), 0)).toEqual(T('2026-10-28T12:00:00Z'));
  });

  it('accepts a string issue time without mutating it', () => {
    expect(shareTokenExpiryFrom('2026-10-28T12:00:00.000Z' as any)).toEqual(T('2026-11-04T12:00:00Z'));
  });
});

// ── Window text ──────────────────────────────────────────────────────────────

describe('formatWindow', () => {
  it('is explicit about the date and the zone, because "14:00–16:00" alone is ambiguous at a gate', () => {
    expect(formatWindow(T('2026-10-28T14:00:00Z'), T('2026-10-28T16:00:00Z')))
      .toBe('2026-10-28 14:00–16:00 UTC');
  });

  it('spells both dates when the window crosses midnight', () => {
    expect(formatWindow(T('2026-10-28T22:00:00Z'), T('2026-10-29T02:00:00Z')))
      .toBe('2026-10-28 22:00 – 2026-10-29 02:00 UTC');
  });

  it('says "no window" for a cancelled change instead of rendering an empty time', () => {
    expect(formatWindow(null, null)).toBe('no window');
    expect(formatWindow(undefined, undefined)).toBe('no window');
    expect(formatWindow(T('2026-10-28T22:00:00Z'), null)).toBe('no window');
  });

  it('pads single-digit hours and minutes', () => {
    expect(formatWindow(T('2026-01-02T03:05:00Z'), T('2026-01-02T04:09:00Z')))
      .toBe('2026-01-02 03:05–04:09 UTC');
  });
});
