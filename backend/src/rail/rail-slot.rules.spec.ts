import { RailSlotApplicationStatus } from '@prisma/client';
import {
  SLOT_TRANSITIONS, addUtcYears, canTransition, checkValidityWindow, computeMobilizeBy, isForfeitureDue,
  isValidityEnded, mobilisationView,
} from './rail-slot.rules';
import { MAX_SLOT_VALIDITY_YEARS, MOBILISATION_DAYS } from './rail-reference';

const STATUSES = Object.values(RailSlotApplicationStatus);
const DAY = 86_400_000;
const T0 = new Date('2026-10-02T09:00:00.000Z');

describe('slot application state machine', () => {
  it('exposes exactly the brief\'s seven states', () => {
    expect([...STATUSES].sort()).toEqual(['ALLOCATED', 'CAPACITY_CONFLICT', 'DRAFT', 'EXPIRED', 'REJECTED', 'SUBMITTED', 'UNDER_ASSESSMENT']);
  });

  it('allows exactly the intended transitions and no others (all 49 pairs)', () => {
    const allowed: Array<[RailSlotApplicationStatus, RailSlotApplicationStatus]> = [
      ['DRAFT', 'SUBMITTED'],
      ['SUBMITTED', 'UNDER_ASSESSMENT'], ['SUBMITTED', 'REJECTED'],
      ['UNDER_ASSESSMENT', 'CAPACITY_CONFLICT'], ['UNDER_ASSESSMENT', 'ALLOCATED'], ['UNDER_ASSESSMENT', 'REJECTED'],
      ['CAPACITY_CONFLICT', 'UNDER_ASSESSMENT'], ['CAPACITY_CONFLICT', 'ALLOCATED'], ['CAPACITY_CONFLICT', 'REJECTED'],
      ['ALLOCATED', 'EXPIRED'],
    ];
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        expect([from, to, canTransition(from, to)]).toEqual([from, to, allowed.some(([a, b]) => a === from && b === to)]);
      }
    }
  });
  it('REJECTED and EXPIRED are terminal; nothing leaps from DRAFT straight to ALLOCATED', () => {
    expect(SLOT_TRANSITIONS.REJECTED).toEqual([]);
    expect(SLOT_TRANSITIONS.EXPIRED).toEqual([]);
    expect(canTransition('DRAFT', 'ALLOCATED')).toBe(false);
    expect(canTransition('SUBMITTED', 'ALLOCATED')).toBe(false); // must be assessed first
  });
});

describe('validity window — at most 5 years', () => {
  const from = new Date('2026-10-02T00:00:00Z');
  it('is the brief\'s 5 years', () => expect(MAX_SLOT_VALIDITY_YEARS).toBe(5));
  it('accepts a window of exactly 5 years', () => {
    expect(checkValidityWindow(from, new Date('2031-10-02T00:00:00Z'))).toEqual({ ok: true });
  });
  it('rejects one millisecond over 5 years', () => {
    const r = checkValidityWindow(from, new Date('2031-10-02T00:00:00.001Z'));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/exceed 5 years/);
  });
  it('accepts short windows', () => expect(checkValidityWindow(from, new Date('2026-10-03T00:00:00Z')).ok).toBe(true));
  it('rejects a window that ends before or when it starts', () => {
    expect(checkValidityWindow(from, from).ok).toBe(false);
    expect(checkValidityWindow(from, new Date('2026-01-01T00:00:00Z')).ok).toBe(false);
  });
  it('rejects invalid dates', () => expect(checkValidityWindow(new Date('x'), from).ok).toBe(false));
  it('handles leap days: 29 Feb 2028 + 5 years is 1 Mar 2033', () => {
    expect(addUtcYears(new Date('2028-02-29T00:00:00Z'), 5).toISOString()).toBe('2033-03-01T00:00:00.000Z');
    expect(checkValidityWindow(new Date('2028-02-29T00:00:00Z'), new Date('2033-03-01T00:00:00Z')).ok).toBe(true);
    expect(checkValidityWindow(new Date('2028-02-29T00:00:00Z'), new Date('2033-03-02T00:00:00Z')).ok).toBe(false);
  });
  it('addUtcYears keeps ordinary dates stable', () => {
    expect(addUtcYears(new Date('2026-10-02T12:34:56.789Z'), 5).toISOString()).toBe('2031-10-02T12:34:56.789Z');
  });
});

describe('60-day mobilisation clock', () => {
  it('is the brief\'s 60 days', () => expect(MOBILISATION_DAYS).toBe(60));
  it('mobilizeBy = allocatedAt + exactly 60 × 24 h', () => {
    expect(computeMobilizeBy(T0).toISOString()).toBe('2026-12-01T09:00:00.000Z');
    expect(computeMobilizeBy(T0).getTime() - T0.getTime()).toBe(60 * DAY);
  });

  const allocated = (over: Record<string, unknown> = {}) => ({
    status: 'ALLOCATED' as RailSlotApplicationStatus, allocatedAt: T0, mobilizeBy: computeMobilizeBy(T0),
    firstOperatedAt: null, forfeitureFlaggedAt: null, ...over,
  });
  const at = (offsetDays: number, extraMs = 0) => new Date(T0.getTime() + offsetDays * DAY + extraMs);

  describe('mobilisationView', () => {
    it('has no clock before allocation', () => {
      for (const status of ['DRAFT', 'SUBMITTED', 'UNDER_ASSESSMENT', 'CAPACITY_CONFLICT'] as const) {
        expect(mobilisationView({ status }, T0)).toMatchObject({ state: 'NOT_ALLOCATED', daysRemaining: null, mobilizeBy: null });
      }
    });
    it('is ON_TRACK with 60 days to go on the day of allocation', () => {
      expect(mobilisationView(allocated(), T0)).toMatchObject({ state: 'ON_TRACK', daysRemaining: 60, label: '60 day(s) to mobilise' });
    });
    it('is DUE_SOON from 14 days out (boundary inclusive) and ON_TRACK at 15', () => {
      expect(mobilisationView(allocated(), at(46))).toMatchObject({ state: 'DUE_SOON', daysRemaining: 14 });
      expect(mobilisationView(allocated(), at(45))).toMatchObject({ state: 'ON_TRACK', daysRemaining: 15 });
    });
    it('counts whole days remaining, rounding a part-day up', () => {
      expect(mobilisationView(allocated(), at(59, 1)).daysRemaining).toBe(1);
      expect(mobilisationView(allocated(), at(59)).daysRemaining).toBe(1);
    });
    it('is due exactly on the deadline (not yet overdue) and OVERDUE one millisecond later', () => {
      expect(mobilisationView(allocated(), at(60))).toMatchObject({ state: 'DUE_SOON', daysRemaining: 0, label: 'Mobilise today' });
      expect(mobilisationView(allocated(), at(60, 1))).toMatchObject({ state: 'OVERDUE' });
      expect(mobilisationView(allocated(), at(65))).toMatchObject({ state: 'OVERDUE', daysRemaining: -5, label: 'Overdue by 5 day(s)' });
    });
    it('shows FORFEITURE_FLAGGED once the sweep has flagged it', () => {
      expect(mobilisationView(allocated({ forfeitureFlaggedAt: at(61) }), at(70)).state).toBe('FORFEITURE_FLAGGED');
    });
    it('shows OPERATED once it has run — operating clears any overdue state', () => {
      expect(mobilisationView(allocated({ firstOperatedAt: at(30) }), at(30)).state).toBe('OPERATED');
      expect(mobilisationView(allocated({ firstOperatedAt: at(70) }), at(80)).state).toBe('OPERATED');
    });
    it('CLOSED for rejected and expired applications', () => {
      expect(mobilisationView({ status: 'REJECTED' }, T0).state).toBe('CLOSED');
      expect(mobilisationView({ status: 'EXPIRED', mobilizeBy: computeMobilizeBy(T0) }, T0).state).toBe('CLOSED');
    });
  });

  describe('isForfeitureDue', () => {
    it('is false until strictly after mobilizeBy', () => {
      expect(isForfeitureDue(allocated(), at(60))).toBe(false);
      expect(isForfeitureDue(allocated(), at(60, 1))).toBe(true);
    });
    it('is false once operated, once already flagged, or when not ALLOCATED', () => {
      expect(isForfeitureDue(allocated({ firstOperatedAt: at(10) }), at(90))).toBe(false);
      expect(isForfeitureDue(allocated({ forfeitureFlaggedAt: at(61) }), at(90))).toBe(false);
      expect(isForfeitureDue(allocated({ status: 'EXPIRED' }), at(90))).toBe(false);
      expect(isForfeitureDue(allocated({ status: 'UNDER_ASSESSMENT', mobilizeBy: null }), at(90))).toBe(false);
    });
  });

  describe('isValidityEnded', () => {
    it('only an ALLOCATED application past its validUntil has ended', () => {
      const validUntil = new Date('2027-01-01T00:00:00Z');
      expect(isValidityEnded({ status: 'ALLOCATED', validUntil }, new Date('2026-12-31T23:59:59Z'))).toBe(false);
      expect(isValidityEnded({ status: 'ALLOCATED', validUntil }, new Date('2027-01-01T00:00:01Z'))).toBe(true);
      expect(isValidityEnded({ status: 'DRAFT', validUntil }, new Date('2030-01-01Z'))).toBe(false);
      expect(isValidityEnded({ status: 'ALLOCATED', validUntil: null }, new Date('2030-01-01Z'))).toBe(false);
    });
  });
});
