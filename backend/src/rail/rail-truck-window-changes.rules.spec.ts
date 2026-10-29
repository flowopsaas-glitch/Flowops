import {
  assessAcknowledgement, assessEscalation, assessWindowChange, bestDeliveryState,
  DEFAULT_GATE_ACK_POLICY, DELIVERY_FIDELITY, DELIVERY_UNAVAILABLE_REASON, formatDurationMinutes,
  median, nextVersion, percentile, resolveAckPolicy, summariseAckedBeforeArrival, summariseAckRate,
  summariseAckLatency, WindowChangeInput,
} from './rail-truck-window-changes.rules';

/**
 * The pure rules behind the truck window-change loop.
 *
 * No Prisma, no clock, no I/O: `now` is an argument. That is the point — the
 * governance a terminal operator relies on (who may move a window, when a move
 * is a late change, what a superseded version may still do, where an
 * unacknowledged change sits on the escalation ladder, and how the KPIs are
 * computed) is evaluated by exactly the code tested here, with nothing mocked
 * between the test and the rule.
 */

const T = (iso: string) => new Date(iso);
const NOW = T('2026-10-28T12:00:00.000Z');
const plusMin = (m: number) => new Date(NOW.getTime() + m * 60_000);
const plusH = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

/** A BOOKED window starting in 4h — outside a 2h cut-off at NOW. */
function input(over: Partial<WindowChangeInput> = {}): WindowChangeInput {
  return {
    status: 'BOOKED',
    windowStart: plusH(4),
    windowEnd: plusH(5),
    now: NOW,
    cutoffHours: 2,
    ...over,
  };
}

// ── Eligibility ──────────────────────────────────────────────────────────────

describe('assessWindowChange', () => {
  it('allows a change outside the cut-off with no reason and marks it unforced', () => {
    expect(assessWindowChange(input({
      newWindowStart: plusH(6), newWindowEnd: plusH(7),
    }))).toEqual({
      allowed: true, forced: false, insideCutoff: false, windowAlreadyClosed: false, cutoffHours: 2,
    });
  });

  it('inside the cut-off, force WITHOUT a reason is refused', () => {
    const a = assessWindowChange(input({
      windowStart: plusH(1), windowEnd: plusH(2), newWindowStart: plusH(6), newWindowEnd: plusH(7), force: true,
    }));
    expect(a.allowed).toBe(false);
    if (a.allowed === false) {
      expect(a.code).toBe('CUTOFF_NEEDS_FORCE');
      expect(a.message).toContain('2h change cut-off');
      expect(a.message).toContain('force=true');
    }
  });

  it('inside the cut-off, a reason WITHOUT force is refused', () => {
    const a = assessWindowChange(input({
      windowStart: plusH(1), windowEnd: plusH(2), newWindowStart: plusH(6), newWindowEnd: plusH(7), reason: 'Loco late',
    }));
    expect(a).toMatchObject({ allowed: false, code: 'CUTOFF_NEEDS_FORCE' });
  });

  it('inside the cut-off, force AND a reason is allowed and flagged forced', () => {
    expect(assessWindowChange(input({
      windowStart: plusH(1), windowEnd: plusH(2), newWindowStart: plusH(6), newWindowEnd: plusH(7),
      force: true, reason: 'Loco late',
    }))).toEqual({
      allowed: true, forced: true, insideCutoff: true, windowAlreadyClosed: false, cutoffHours: 2,
    });
  });

  it('a whitespace-only reason is no reason', () => {
    const a = assessWindowChange(input({
      windowStart: plusH(1), windowEnd: plusH(2), newWindowStart: plusH(6), newWindowEnd: plusH(7),
      force: true, reason: '   \t\n ',
    }));
    expect(a).toMatchObject({ allowed: false, code: 'CUTOFF_NEEDS_FORCE' });
  });

  it('the cut-off boundary is inclusive: exactly cutoffHours before start is INSIDE', () => {
    // windowStart is exactly NOW + 2h, so the cut-off opened at NOW.
    const atBoundary = assessWindowChange(input({
      windowStart: plusH(2), windowEnd: plusH(3), newWindowStart: plusH(6), newWindowEnd: plusH(7),
    }));
    expect(atBoundary).toMatchObject({ allowed: false, code: 'CUTOFF_NEEDS_FORCE' });

    const oneMsOutside = assessWindowChange(input({
      windowStart: new Date(plusH(2).getTime() + 1), windowEnd: plusH(3),
      newWindowStart: plusH(6), newWindowEnd: plusH(7),
    }));
    expect(oneMsOutside).toMatchObject({ allowed: true, insideCutoff: false });
  });

  it('a zero-hour cut-off means the cut-off opens at window start (0 is a real setting, not a fallback)', () => {
    // Well before the window: nothing is a late change.
    expect(assessWindowChange(input({
      cutoffHours: 0, windowStart: plusH(48), windowEnd: plusH(49),
      newWindowStart: plusH(60), newWindowEnd: plusH(61),
    }))).toMatchObject({ allowed: true, insideCutoff: false });
    // At the window start itself: now it is late, and needs force + reason.
    expect(assessWindowChange(input({
      cutoffHours: 0, windowStart: NOW, windowEnd: plusH(1),
      newWindowStart: plusH(60), newWindowEnd: plusH(61),
    }))).toMatchObject({ allowed: false, code: 'CUTOFF_NEEDS_FORCE' });
  });

  it('refuses a new window whose end is not after its start', () => {
    const a = assessWindowChange(input({ newWindowStart: plusH(7), newWindowEnd: plusH(6) }));
    expect(a).toMatchObject({ allowed: false, code: 'INVALID_WINDOW' });
    if (a.allowed === false) expect(a.message).toContain('windowEnd must be after');
  });

  it('refuses an equal-length zero window', () => {
    expect(assessWindowChange(input({ newWindowStart: plusH(6), newWindowEnd: plusH(6) })))
      .toMatchObject({ allowed: false, code: 'INVALID_WINDOW' });
  });

  it('refuses a half-specified window and an unparseable date', () => {
    expect(assessWindowChange(input({ newWindowStart: plusH(6), newWindowEnd: null })))
      .toMatchObject({ allowed: false, code: 'INVALID_WINDOW' });
    expect(assessWindowChange(input({ newWindowStart: plusH(6) })))
      .toMatchObject({ allowed: false, code: 'INVALID_WINDOW' });
    expect(assessWindowChange(input({ newWindowStart: T('not-a-date'), newWindowEnd: plusH(7) })))
      .toMatchObject({ allowed: false, code: 'INVALID_WINDOW' });
  });

  it('a malformed window is reported before any status reasoning', () => {
    // The operator gets the real complaint, not a governance error about a truck
    // that has already arrived.
    expect(assessWindowChange(input({
      status: 'ARRIVED', newWindowStart: plusH(7), newWindowEnd: plusH(6),
    }))).toMatchObject({ allowed: false, code: 'INVALID_WINDOW' });
  });

  it.each(['ARRIVED', 'LOADING', 'COMPLETED', 'NO_SHOW', 'CANCELLED'])(
    'refuses a change once the appointment is %s — the "change after departure" case',
    (status) => {
      const a = assessWindowChange(input({ status, newWindowStart: plusH(6), newWindowEnd: plusH(7) }));
      expect(a.allowed).toBe(false);
      if (a.allowed === false) {
        expect(a.code).toBe('NOT_BOOKED');
        expect(a.message).toContain(status);
        expect(a.message).toContain('Only a BOOKED window');
      }
    },
  );

  it('refuses to publish a NEW window into a slot that has already closed', () => {
    const a = assessWindowChange(input({
      windowStart: plusH(-5), windowEnd: plusH(-4), newWindowStart: plusH(6), newWindowEnd: plusH(7),
      force: true, reason: 'Too late anyway',
    }));
    expect(a.allowed).toBe(false);
    if (a.allowed === false) {
      expect(a.code).toBe('WINDOW_CLOSED');
      expect(a.message).toContain('Cancel it or mark the appointment no-show');
    }
  });

  it('the closed check is on the boundary: closing exactly at NOW is closed', () => {
    expect(assessWindowChange(input({
      windowStart: plusH(-2), windowEnd: NOW, newWindowStart: plusH(6), newWindowEnd: plusH(7),
    }))).toMatchObject({ allowed: false, code: 'WINDOW_CLOSED' });
    expect(assessWindowChange(input({
      windowStart: plusH(-2), windowEnd: new Date(NOW.getTime() + 1),
      newWindowStart: plusH(6), newWindowEnd: plusH(7), force: true, reason: 'Just in time',
    }))).toMatchObject({ allowed: true, windowAlreadyClosed: false, insideCutoff: true });
  });

  it('CANCELLING a closed window is allowed — that is the action the refusal points at — and records that it was dead', () => {
    const a = assessWindowChange(input({
      windowStart: plusH(-5), windowEnd: plusH(-4), force: true, reason: 'Truck never arrived',
    }));
    expect(a).toEqual({
      allowed: true, forced: true, insideCutoff: true, windowAlreadyClosed: true, cutoffHours: 2,
    });
  });

  it('cancelling needs no new window at all', () => {
    expect(assessWindowChange(input()).allowed).toBe(true);
    expect(assessWindowChange(input({ newWindowStart: null, newWindowEnd: null })))
      .toMatchObject({ allowed: false, code: 'INVALID_WINDOW' });
  });

  it('a refusal always carries the cut-off it applied, so the message is checkable', () => {
    const a = assessWindowChange(input({ cutoffHours: 6, windowStart: plusH(5), windowEnd: plusH(6), status: 'ARRIVED' }));
    expect(a).toMatchObject({ allowed: false, code: 'NOT_BOOKED', cutoffHours: 6 });
  });
});

// ── Versioning ───────────────────────────────────────────────────────────────

describe('nextVersion', () => {
  it('starts at 1 and is monotonic — versions are never reused', () => {
    expect(nextVersion(null)).toBe(1);
    expect(nextVersion(undefined)).toBe(1);
    expect(nextVersion(0)).toBe(1);
    expect(nextVersion(1)).toBe(2);
    expect(nextVersion(7)).toBe(8);
  });

  it('survives a corrupt aggregate rather than restarting the count', () => {
    expect(nextVersion(-3)).toBe(1);
    expect(nextVersion(Number.NaN)).toBe(1);
    expect(nextVersion(2.9)).toBe(3);
  });
});

// ── Acknowledgement ──────────────────────────────────────────────────────────

describe('assessAcknowledgement', () => {
  it('a fresh ack on the ACTIVE version is allowed and is not a replay', () => {
    expect(assessAcknowledgement({ changeStatus: 'ACTIVE', ackState: 'UNACKED', activeVersion: 3 }))
      .toEqual({ allowed: true, idempotentReplay: false });
  });

  it('a repeat ack on the ACTIVE version is an idempotent replay, not an error', () => {
    expect(assessAcknowledgement({ changeStatus: 'ACTIVE', ackState: 'ACKNOWLEDGED', activeVersion: 3 }))
      .toEqual({ allowed: true, idempotentReplay: true });
  });

  it('a SUPERSEDED version is refused and points at the version that is current', () => {
    const a = assessAcknowledgement({ changeStatus: 'SUPERSEDED', ackState: 'UNACKED', activeVersion: 4 });
    expect(a.allowed).toBe(false);
    if (a.allowed === false) {
      expect(a.code).toBe('SUPERSEDED');
      expect(a.message).toContain('version 4');
      expect(a.message).toContain('superseded');
    }
  });

  it('a SUPERSEDED version with no known successor still refuses, and says to reload', () => {
    const a = assessAcknowledgement({ changeStatus: 'SUPERSEDED', ackState: 'UNACKED', activeVersion: null });
    expect(a).toMatchObject({ allowed: false, code: 'SUPERSEDED' });
    if (a.allowed === false) expect(a.message).toContain('Reload the appointment');
  });

  it('supersede outranks a previous acknowledgement: an ack on a dead version stays dead', () => {
    expect(assessAcknowledgement({ changeStatus: 'SUPERSEDED', ackState: 'ACKNOWLEDGED', activeVersion: 2 }))
      .toMatchObject({ allowed: false, code: 'SUPERSEDED' });
  });
});

// ── Escalation ladder ────────────────────────────────────────────────────────

describe('assessEscalation', () => {
  const base = {
    changedAt: NOW, ackState: 'UNACKED' as const,
    ackDueMinutes: 30, reminderAfterMinutes: 15, escalateAfterMinutes: 45,
  };

  it('starts at NONE with the full due window ahead of it', () => {
    expect(assessEscalation({ ...base, now: plusMin(5) })).toEqual({
      stage: 'NONE', minutesSinceChange: 5, minutesUntilDue: 25,
      overdue: false, reminderDue: false, escalationDue: false,
    });
  });

  it('crosses to REMINDER exactly at the reminder threshold', () => {
    expect(assessEscalation({ ...base, now: plusMin(14) }).stage).toBe('NONE');
    expect(assessEscalation({ ...base, now: plusMin(15) })).toMatchObject({ stage: 'REMINDER', reminderDue: true, escalationDue: false });
  });

  it('crosses to ESCALATED exactly at the escalation threshold', () => {
    expect(assessEscalation({ ...base, now: plusMin(44) }).stage).toBe('REMINDER');
    expect(assessEscalation({ ...base, now: plusMin(45) })).toMatchObject({ stage: 'ESCALATED', escalationDue: true });
    expect(assessEscalation({ ...base, now: plusMin(600) }).stage).toBe('ESCALATED');
  });

  it('overdue is its own fact, driven by ackDueMinutes', () => {
    expect(assessEscalation({ ...base, now: plusMin(29) }).overdue).toBe(false);
    expect(assessEscalation({ ...base, now: plusMin(30) }).overdue).toBe(true);
    expect(assessEscalation({ ...base, now: plusMin(31) }).minutesUntilDue).toBe(-1);
  });

  it('an ACKNOWLEDGED recipient is always NONE — acknowledging stops the ladder', () => {
    const acked = { ...base, ackState: 'ACKNOWLEDGED' as const };
    expect(assessEscalation({ ...acked, now: plusMin(600) })).toEqual({
      stage: 'NONE', minutesSinceChange: 600, minutesUntilDue: -570,
      overdue: false, reminderDue: false, escalationDue: false,
    });
  });

  it('a client clock ahead of the server floors elapsed time at 0 rather than going negative', () => {
    expect(assessEscalation({ ...base, now: plusMin(-30) })).toMatchObject({
      stage: 'NONE', minutesSinceChange: 0, overdue: false,
    });
  });

  it('a zero-minute ladder escalates immediately', () => {
    expect(assessEscalation({
      ...base, ackDueMinutes: 0, reminderAfterMinutes: 0, escalateAfterMinutes: 0, now: NOW,
    })).toMatchObject({ stage: 'ESCALATED', overdue: true });
  });

  it('a misconfigured ladder where escalation precedes the reminder still escalates', () => {
    expect(assessEscalation({
      ...base, reminderAfterMinutes: 60, escalateAfterMinutes: 10, now: plusMin(20),
    }).stage).toBe('ESCALATED');
  });

  it('fractional minutes floor, so a change is never reported as older than it is', () => {
    expect(assessEscalation({ ...base, now: new Date(NOW.getTime() + 15 * 60_000 - 1) }).minutesSinceChange).toBe(14);
  });
});

describe('ack policy resolution', () => {
  it('exposes documented defaults, labelled as defaults and never as measurements', () => {
    expect(DEFAULT_GATE_ACK_POLICY).toEqual({ ackDueMinutes: 30, reminderAfterMinutes: 15, escalateAfterMinutes: 45 });
    expect(resolveAckPolicy(null)).toEqual({ ...DEFAULT_GATE_ACK_POLICY, source: 'DEFAULT' });
    expect(resolveAckPolicy(undefined)).toEqual({ ...DEFAULT_GATE_ACK_POLICY, source: 'DEFAULT' });
  });

  it('a terminal policy row wins and is labelled as coming from the terminal', () => {
    expect(resolveAckPolicy({ ackDueMinutes: 10, reminderAfterMinutes: 5, escalateAfterMinutes: 20 }))
      .toEqual({ ackDueMinutes: 10, reminderAfterMinutes: 5, escalateAfterMinutes: 20, source: 'TERMINAL' });
  });

  it('a null, negative, fractional or non-numeric field falls back per field, not for the whole row', () => {
    expect(resolveAckPolicy({ ackDueMinutes: null, reminderAfterMinutes: 5, escalateAfterMinutes: 20 }))
      .toEqual({ ackDueMinutes: 30, reminderAfterMinutes: 5, escalateAfterMinutes: 20, source: 'TERMINAL' });
    expect(resolveAckPolicy({ ackDueMinutes: -5, reminderAfterMinutes: Number.NaN, escalateAfterMinutes: 20 }))
      .toEqual({ ackDueMinutes: 30, reminderAfterMinutes: 15, escalateAfterMinutes: 20, source: 'TERMINAL' });
    expect(resolveAckPolicy({ ackDueMinutes: 12.9 } as any).ackDueMinutes).toBe(12);
    expect(resolveAckPolicy({ ackDueMinutes: '10' } as any).ackDueMinutes).toBe(30);
    expect(resolveAckPolicy({ ackDueMinutes: Number.POSITIVE_INFINITY } as any).ackDueMinutes).toBe(30);
  });

  it('an empty row still reports TERMINAL as the source, with every default applied', () => {
    expect(resolveAckPolicy({})).toEqual({ ...DEFAULT_GATE_ACK_POLICY, source: 'TERMINAL' });
  });

  it('0 minutes is a real setting (due immediately), not a missing one', () => {
    expect(resolveAckPolicy({ ackDueMinutes: 0, reminderAfterMinutes: 0, escalateAfterMinutes: 0 }))
      .toEqual({ ackDueMinutes: 0, reminderAfterMinutes: 0, escalateAfterMinutes: 0, source: 'TERMINAL' });
  });
});

// ── Delivery-state fidelity ──────────────────────────────────────────────────

describe('delivery-state fidelity', () => {
  it('orders the states so a hopeful one can never outrank an observed one', () => {
    expect(DELIVERY_FIDELITY.UNAVAILABLE).toBeLessThan(DELIVERY_FIDELITY.QUEUED);
    expect(DELIVERY_FIDELITY.QUEUED).toBeLessThan(DELIVERY_FIDELITY.PUBLISHED);
    expect(DELIVERY_FIDELITY.PUBLISHED).toBeLessThan(DELIVERY_FIDELITY.SENT);
    expect(DELIVERY_FIDELITY.SENT).toBeLessThan(DELIVERY_FIDELITY.DELIVERED);
  });

  it('takes the best OBSERVED state across channels', () => {
    expect(bestDeliveryState(['UNAVAILABLE', 'SENT'])).toBe('SENT');
    expect(bestDeliveryState(['SENT', 'DELIVERED'])).toBe('DELIVERED');
    expect(bestDeliveryState(['PUBLISHED', 'SENT'])).toBe('SENT');
    expect(bestDeliveryState(['FAILED', 'PUBLISHED'])).toBe('PUBLISHED');
    expect(bestDeliveryState(['DELIVERED', 'SENT', 'UNAVAILABLE'])).toBe('DELIVERED');
  });

  it('a single UNAVAILABLE channel stays UNAVAILABLE — it is never upgraded to SENT', () => {
    expect(bestDeliveryState(['UNAVAILABLE'])).toBe('UNAVAILABLE');
    expect(bestDeliveryState(['FAILED'])).toBe('FAILED');
    expect(bestDeliveryState(['QUEUED'])).toBe('QUEUED');
  });

  it('no channels at all is QUEUED, never DELIVERED', () => {
    expect(bestDeliveryState([])).toBe('QUEUED');
  });

  it('an unrecognised token ranks below everything known', () => {
    expect(bestDeliveryState(['SOMETHING_NEW', 'SENT'])).toBe('SENT');
    expect(bestDeliveryState(['SENT', 'SOMETHING_NEW'])).toBe('SENT');
  });

  it('names every reason a recipient can be unreachable, so the UI never renders an empty cell', () => {
    expect(Object.values(DELIVERY_UNAVAILABLE_REASON).sort()).toEqual([
      'DRIVER_NOT_ASSIGNED', 'NO_PUSH_SUBSCRIPTION', 'NO_SHARE_TOKEN',
      'NO_SOCKET_RECEIPT', 'PUSH_NOT_CONFIGURED', 'SHARE_TOKEN_EXPIRED',
    ]);
  });
});

// ── Measurement maths ────────────────────────────────────────────────────────

describe('percentile (nearest-rank)', () => {
  it('returns null for an empty sample — an absent measurement is UNKNOWN, never 0', () => {
    expect(percentile([], 90)).toBeNull();
    expect(percentile([], 50)).toBeNull();
  });

  it('uses nearest-rank, so it never invents a value between two observations', () => {
    expect(percentile([4, 8, 12, 40], 90)).toBe(40);
    expect(percentile([1, 2, 3, 4, 5], 90)).toBe(5);
    expect(percentile([10, 20], 90)).toBe(20);
    expect(percentile([7], 90)).toBe(7);
    // An interpolated P90 over [4,8,12,40] would be ~34.4 — a number nobody observed.
    expect(percentile([4, 8, 12, 40], 90)).not.toBe(34.4);
  });

  it('clamps at the ends', () => {
    expect(percentile([4, 8, 12], 0)).toBe(4);
    expect(percentile([4, 8, 12], -10)).toBe(4);
    expect(percentile([4, 8, 12], 100)).toBe(12);
    expect(percentile([4, 8, 12], 250)).toBe(12);
  });

  it('drops non-finite samples', () => {
    expect(percentile([4, Number.NaN, 12], 90)).toBe(12);
    expect(percentile([Number.NaN], 90)).toBeNull();
    expect(percentile([Number.POSITIVE_INFINITY, 5], 90)).toBe(5);
  });
});

describe('median', () => {
  it('returns null for an empty sample', () => {
    expect(median([])).toBeNull();
    expect(median([Number.NaN])).toBeNull();
  });

  it('takes the middle of an odd sample and the mean of an even one', () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([5])).toBe(5);
  });

  it('rounds the even-sample mean to one decimal rather than showing float noise', () => {
    expect(median([4, 8, 12, 40])).toBe(10);
    expect(median([1, 2])).toBe(1.5);
    expect(median([2.2, 2.3])).toBe(2.3);
    expect(median([0.1, 0.2])).toBe(0.2);
  });

  it('drops non-finite values', () => {
    expect(median([1, Number.NaN, 3])).toBe(2);
  });
});

describe('summariseAckLatency', () => {
  it('reports n alongside every figure', () => {
    expect(summariseAckLatency([
      { minutes: 40 }, { minutes: 4 }, { minutes: 12 }, { minutes: 8 },
    ])).toEqual({ medianMinutes: 10, p90Minutes: 40, n: 4, minMinutes: 4, maxMinutes: 40 });
  });

  it('an empty sample is all nulls with n=0 — never zeros', () => {
    expect(summariseAckLatency([])).toEqual({
      medianMinutes: null, p90Minutes: null, n: 0, minMinutes: null, maxMinutes: null,
    });
  });

  it('a single observation reports itself with n=1, so the UI can show how thin the evidence is', () => {
    expect(summariseAckLatency([{ minutes: 6 }])).toEqual({
      medianMinutes: 6, p90Minutes: 6, n: 1, minMinutes: 6, maxMinutes: 6,
    });
  });

  it('ignores a sample that is not a finite number of minutes', () => {
    expect(summariseAckLatency([{ minutes: 4 }, { minutes: Number.NaN }])).toMatchObject({ n: 1, medianMinutes: 4 });
  });
});

describe('summariseAckedBeforeArrival', () => {
  it('counts before / after / never, and keeps the denominator visible', () => {
    expect(summariseAckedBeforeArrival([
      { ackedAt: T('2026-10-28T09:00:00Z'), arrivedAt: T('2026-10-28T10:00:00Z') },
      { ackedAt: T('2026-10-28T11:00:00Z'), arrivedAt: T('2026-10-28T10:00:00Z') },
      { ackedAt: null, arrivedAt: T('2026-10-28T10:00:00Z') },
    ])).toEqual({
      ackedBeforeArrival: 1, ackedAfterArrival: 1, neverAcked: 1,
      denominator: 3, excludedNoArrival: 0, excludedUnreachable: 0, percent: 33.3,
    });
  });

  it('an ack exactly at arrival counts as before — the truck had not gone in yet', () => {
    expect(summariseAckedBeforeArrival([
      { ackedAt: T('2026-10-28T10:00:00Z'), arrivedAt: T('2026-10-28T10:00:00Z') },
    ])).toMatchObject({ ackedBeforeArrival: 1, ackedAfterArrival: 0, percent: 100 });
  });

  it('a change with no recorded arrival is EXCLUDED and counted, never dropped silently', () => {
    expect(summariseAckedBeforeArrival([
      { ackedAt: T('2026-10-28T09:00:00Z'), arrivedAt: null },
      { ackedAt: null, arrivedAt: null },
    ])).toEqual({
      ackedBeforeArrival: 0, ackedAfterArrival: 0, neverAcked: 0,
      denominator: 0, excludedNoArrival: 2, excludedUnreachable: 0, percent: null,
    });
  });

  it('an empty set is percent null, not 0% and not 100%', () => {
    expect(summariseAckedBeforeArrival([]).percent).toBeNull();
    expect(summariseAckedBeforeArrival([]).denominator).toBe(0);
  });

  it('rounds the percentage to one decimal', () => {
    const rows = (before: number, after: number) => [
      ...Array.from({ length: before }, () => ({ ackedAt: T('2026-10-28T09:00:00Z'), arrivedAt: T('2026-10-28T10:00:00Z') })),
      ...Array.from({ length: after }, () => ({ ackedAt: T('2026-10-28T11:00:00Z'), arrivedAt: T('2026-10-28T10:00:00Z') })),
    ];
    expect(summariseAckedBeforeArrival(rows(2, 1)).percent).toBe(66.7);
    expect(summariseAckedBeforeArrival(rows(1, 6)).percent).toBe(14.3);
    expect(summariseAckedBeforeArrival(rows(7, 0)).percent).toBe(100);
  });
});

// ── Human formatting ─────────────────────────────────────────────────────────

describe('formatDurationMinutes', () => {
  it('renders an absent measurement as UNKNOWN, never as 0', () => {
    expect(formatDurationMinutes(null)).toBe('UNKNOWN');
    expect(formatDurationMinutes(Number.NaN)).toBe('UNKNOWN');
    expect(formatDurationMinutes(Number.POSITIVE_INFINITY)).toBe('UNKNOWN');
  });

  it('never rounds a sub-minute gap down to "0 min", which would read as instantaneous', () => {
    expect(formatDurationMinutes(0)).toBe('<1 min');
    expect(formatDurationMinutes(0.4)).toBe('<1 min');
    expect(formatDurationMinutes(0.999)).toBe('<1 min');
    expect(formatDurationMinutes(-5)).toBe('<1 min');
  });

  it('rounds minutes, then switches to hours without producing "1h 60m"', () => {
    expect(formatDurationMinutes(1)).toBe('1 min');
    expect(formatDurationMinutes(7.4)).toBe('7 min');
    expect(formatDurationMinutes(7.6)).toBe('8 min');
    expect(formatDurationMinutes(59.4)).toBe('59 min');
    expect(formatDurationMinutes(59.6)).toBe('1h');
    expect(formatDurationMinutes(60)).toBe('1h');
    expect(formatDurationMinutes(90)).toBe('1h 30m');
    expect(formatDurationMinutes(119.7)).toBe('2h');
    expect(formatDurationMinutes(1440)).toBe('24h');
  });
});

// ── Reachability: an unfillable obligation is not a failure ──────────────────

describe('summariseAckedBeforeArrival reachability', () => {
  const T = (iso: string) => new Date(iso);

  it('excludes a change nobody could have confirmed, and counts the exclusion', () => {
    // No driver assigned and no share link: there was no recipient to tell, so
    // the change cannot count against the terminal's ack rate.
    const out = summariseAckedBeforeArrival([
      { ackedAt: T('2026-10-28T09:00:00Z'), arrivedAt: T('2026-10-28T10:00:00Z'), reachable: true },
      { ackedAt: null, arrivedAt: T('2026-10-28T10:00:00Z'), reachable: false },
      { ackedAt: null, arrivedAt: T('2026-10-28T11:00:00Z') },
    ]);
    expect(out).toEqual({
      ackedBeforeArrival: 1, ackedAfterArrival: 0, neverAcked: 1,
      denominator: 2, excludedNoArrival: 0, excludedUnreachable: 1, percent: 50,
    });
  });

  it('treats reachability as a STRONGER exclusion than a missing arrival', () => {
    const out = summariseAckedBeforeArrival([
      { ackedAt: null, arrivedAt: null, reachable: false },
    ]);
    expect(out.excludedUnreachable).toBe(1);
    expect(out.excludedNoArrival).toBe(0);
    expect(out.denominator).toBe(0);
    expect(out.percent).toBeNull();
  });

  it('defaults to reachable, so existing callers keep their meaning', () => {
    const out = summariseAckedBeforeArrival([{ ackedAt: null, arrivedAt: T('2026-10-28T10:00:00Z') }]);
    expect(out.neverAcked).toBe(1);
    expect(out.excludedUnreachable).toBe(0);
  });
});

describe('summariseAckRate', () => {
  it('reports numerator, denominator and the unreachable count separately', () => {
    const out = summariseAckRate([
      { recipientType: 'HAULIER', acknowledged: true, reachable: true },
      { recipientType: 'HAULIER', acknowledged: false, reachable: true },
      { recipientType: 'HAULIER', acknowledged: false, reachable: true },
      { recipientType: 'HAULIER', acknowledged: false, reachable: true },
    ]);
    expect(out).toEqual({
      acknowledged: 1, notAcknowledged: 3, denominator: 4, unreachable: 0,
      driverNotAssigned: 0, percent: 25, percentText: '25%',
    });
  });

  it('EXCLUDES unreachable recipients from the denominator and counts them on their own', () => {
    const out = summariseAckRate([
      { recipientType: 'DRIVER', acknowledged: true, reachable: true },
      { recipientType: 'DRIVER', acknowledged: false, reachable: false, notAssigned: true },
      { recipientType: 'DRIVER', acknowledged: false, reachable: false, notAssigned: true },
    ]);
    // 1 of 1 reachable drivers confirmed — not "1 of 3", which would report a
    // missing driver assignment as a driver performance failure.
    expect(out.acknowledged).toBe(1);
    expect(out.denominator).toBe(1);
    expect(out.unreachable).toBe(2);
    expect(out.driverNotAssigned).toBe(2);
    expect(out.percentText).toBe('100%');
  });

  it('is UNKNOWN, not 0%, when nothing was reachable', () => {
    const out = summariseAckRate([
      { recipientType: 'DRIVER', acknowledged: false, reachable: false, notAssigned: true },
    ]);
    expect(out.denominator).toBe(0);
    expect(out.percent).toBeNull();
    expect(out.percentText).toBe('UNKNOWN');
    expect(out.driverNotAssigned).toBe(1);
  });

  it('is UNKNOWN for an empty set, never 100%', () => {
    expect(summariseAckRate([])).toMatchObject({ denominator: 0, percent: null, percentText: 'UNKNOWN' });
  });

  it('rounds to one decimal place without claiming more precision than n supports', () => {
    const out = summariseAckRate([
      { recipientType: 'HAULIER', acknowledged: true, reachable: true },
      { recipientType: 'HAULIER', acknowledged: false, reachable: true },
      { recipientType: 'HAULIER', acknowledged: false, reachable: true },
    ]);
    expect(out.percent).toBe(33.3);
    expect(out.percentText).toBe('33.3%');
  });
});
