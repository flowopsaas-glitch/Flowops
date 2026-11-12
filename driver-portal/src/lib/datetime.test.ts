import { describe, expect, it } from 'vitest';
import { formatAgo, formatTime, formatWhen, formatWindow } from './datetime';

/**
 * A driver reads these off a phone in a moving cab. The failure that matters is
 * not a wrong format, it is printing something that looks like a fact when
 * there is no fact — "Invalid Date", or a 1970 timestamp from a null.
 */

const NOW = new Date('2026-11-20T12:00:00.000Z');

describe('formatTime', () => {
  it('prints a clock time', () => {
    expect(formatTime('2026-11-20T14:05:00.000Z')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('never prints "Invalid Date" for junk', () => {
    expect(formatTime('not-a-date')).toBe('—');
  });

  it('treats null, undefined and empty as no time, not as 1970', () => {
    // The bug this guards: new Date(null) is the epoch, which would render as
    // 01:00 and look like a real planned time.
    expect(formatTime(null)).toBe('—');
    expect(formatTime(undefined)).toBe('—');
    expect(formatTime('')).toBe('—');
  });
});

describe('formatWhen', () => {
  it('omits the date for a time today', () => {
    expect(formatWhen('2026-11-20T14:05:00.000Z', NOW)).toMatch(/^\d{2}:\d{2}$/);
  });

  it('includes the date for a time on another day', () => {
    const out = formatWhen('2026-11-22T09:00:00.000Z', NOW);
    expect(out).toContain('22');
    expect(out).toMatch(/\d{2}:\d{2}$/);
  });

  it('falls back to a dash rather than a fabricated time', () => {
    expect(formatWhen(null, NOW)).toBe('—');
  });
});

describe('formatAgo', () => {
  it('says "just now" for a fresh update', () => {
    expect(formatAgo('2026-11-20T11:59:30.000Z', NOW)).toBe('just now');
  });

  it('counts minutes and hours', () => {
    expect(formatAgo('2026-11-20T11:56:00.000Z', NOW)).toBe('4 min');
    expect(formatAgo('2026-11-20T09:00:00.000Z', NOW)).toBe('3 hr');
  });

  it('never reports a negative wait when the device clock is ahead of the server', () => {
    // Clock skew is normal on phones; "waiting -3 min" would read as a bug.
    expect(formatAgo('2026-11-20T12:05:00.000Z', NOW)).toBe('just now');
  });

  it('says nothing when there is no timestamp to measure', () => {
    expect(formatAgo(null, NOW)).toBe('');
  });
});

describe('formatWindow', () => {
  it('joins start and end', () => {
    expect(formatWindow('2026-11-20T08:00:00.000Z', '2026-11-20T16:30:00.000Z', NOW)).toContain('–');
  });

  it('shows the start alone when there is no end', () => {
    expect(formatWindow('2026-11-20T08:00:00.000Z', null, NOW)).toMatch(/^\d{2}:\d{2}$/);
  });

  it('shows a dash when there is nothing at all', () => {
    expect(formatWindow(null, null, NOW)).toBe('—');
  });
});
