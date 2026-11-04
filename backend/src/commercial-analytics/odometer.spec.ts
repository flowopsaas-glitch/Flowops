import { odometerSpan } from './odometer';

const at = (iso: string) => new Date(iso);

describe('odometerSpan — believable distance', () => {
  it('sums the increases between readings', () => {
    const span = odometerSpan([
      { at: at('2026-10-01T06:00:00Z'), km: 100000 },
      { at: at('2026-10-03T06:00:00Z'), km: 100600 },
      { at: at('2026-10-09T06:00:00Z'), km: 101000 },
    ]);
    expect(span.km).toBe(1000);
    expect(span.readings).toBe(3);
    expect(span.excluded).toBe(0);
    expect(span.note).toMatch(/3 odometer readings/);
  });

  it('is null, not zero, when a single reading measures nothing', () => {
    const span = odometerSpan([{ at: at('2026-10-01T06:00:00Z'), km: 100000 }]);
    expect(span.km).toBeNull();
    expect(span.readings).toBe(1);
    expect(span.note).toMatch(/single reading/i);
  });

  it('is null when there are no readings at all', () => {
    expect(odometerSpan([]).km).toBeNull();
  });

  it('ignores null and non-finite readings rather than treating them as zero', () => {
    const span = odometerSpan([
      { at: at('2026-10-01T06:00:00Z'), km: 100000 },
      { at: at('2026-10-02T06:00:00Z'), km: null },
      { at: at('2026-10-03T06:00:00Z'), km: Number.NaN },
      { at: at('2026-10-04T06:00:00Z'), km: 100400 },
    ]);
    expect(span.km).toBe(400);
    expect(span.readings).toBe(2);
  });
});

describe('odometerSpan — a driver with more than one vehicle', () => {
  it('does not invent 75 000 km when two vehicles are in play', () => {
    // The old max−min span reported 75 000 km here.
    const span = odometerSpan([
      { at: at('2026-10-01T06:00:00Z'), km: 120000, source: 'cost' },
      { at: at('2026-10-02T06:00:00Z'), km: 45000, source: 'cost' }, // the bakkie
      { at: at('2026-10-03T06:00:00Z'), km: 45120, source: 'cost' },
    ]);
    expect(span.km).toBe(120);
    expect(span.excluded).toBe(1);
    expect(span.note).toMatch(/went backwards|jumped/i);
  });

  it('keeps counting real distance after a vehicle change', () => {
    const span = odometerSpan([
      { at: at('2026-10-01T06:00:00Z'), km: 120000 },
      { at: at('2026-10-02T06:00:00Z'), km: 45000 },
      { at: at('2026-10-03T06:00:00Z'), km: 45300 },
      { at: at('2026-10-04T06:00:00Z'), km: 45600 },
    ]);
    expect(span.km).toBe(600);
  });
});

describe('odometerSpan — bad data does not survive', () => {
  it('drops a mistyped reading instead of letting it inflate everything after it', () => {
    // 1 200 000 is one keystroke away from 120 000.
    const span = odometerSpan([
      { at: at('2026-10-01T06:00:00Z'), km: 119800 },
      { at: at('2026-10-02T06:00:00Z'), km: 120000 },
      { at: at('2026-10-03T06:00:00Z'), km: 1200000 },
      { at: at('2026-10-04T06:00:00Z'), km: 120400 },
      { at: at('2026-10-05T06:00:00Z'), km: 120900 },
    ]);
    // 200 (119800→120000) + 500 (120400→120900). The +1 198 000 jump and the
    // −1 196 000 fall back are both dropped; the 400 km inside the typo chain is
    // not claimed, because the readings either side of it are not believable.
    expect(span.km).toBe(700);
    expect(span.excluded).toBe(2);
    expect(span.note).toMatch(/left out/i);
  });

  it('drops an odometer reset (backwards) without failing the whole period', () => {
    const span = odometerSpan([
      { at: at('2026-10-01T06:00:00Z'), km: 90000 },
      { at: at('2026-10-02T06:00:00Z'), km: 120 }, // cluster replaced
      { at: at('2026-10-03T06:00:00Z'), km: 400 },
    ]);
    expect(span.km).toBe(280);
    expect(span.excluded).toBe(1);
  });

  it('accepts a zero delta as no distance rather than as an exclusion', () => {
    const span = odometerSpan([
      { at: at('2026-10-01T06:00:00Z'), km: 100000 },
      { at: at('2026-10-01T06:00:00Z'), km: 100000 }, // fuel + service, same reading
      { at: at('2026-10-02T06:00:00Z'), km: 100250 },
    ]);
    expect(span.km).toBe(250);
    expect(span.excluded).toBe(0);
  });

  it('orders by time, not by the order the rows happened to come back', () => {
    const span = odometerSpan([
      { at: at('2026-10-09T06:00:00Z'), km: 101000 },
      { at: at('2026-10-01T06:00:00Z'), km: 100000 },
      { at: at('2026-10-05T06:00:00Z'), km: 100600 },
    ]);
    expect(span.km).toBe(1000);
    expect(span.excluded).toBe(0);
  });

  it('falls back to the given order when no reading carries a time', () => {
    const span = odometerSpan([{ km: 100000 }, { km: 100600 }, { km: 101000 }]);
    expect(span.km).toBe(1000);
  });
});

describe('odometerSpan — the cap is a policy, not a truth', () => {
  it('honours a caller-supplied limit', () => {
    const readings = [
      { at: at('2026-10-01T06:00:00Z'), km: 0 },
      { at: at('2026-10-02T06:00:00Z'), km: 900 },
    ];
    expect(odometerSpan(readings).km).toBe(900);
    expect(odometerSpan(readings, { maxDeltaKm: 500 }).km).toBe(0);
    expect(odometerSpan(readings, { maxDeltaKm: 500 }).excluded).toBe(1);
  });

  it('never returns a negative distance, whatever the input order', () => {
    const span = odometerSpan([
      { at: at('2026-10-01T06:00:00Z'), km: 5000 },
      { at: at('2026-10-02T06:00:00Z'), km: 4000 },
      { at: at('2026-10-03T06:00:00Z'), km: 3000 },
    ]);
    expect(span.km).toBe(0);
    expect(span.excluded).toBe(2);
  });
});
