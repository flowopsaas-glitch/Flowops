import { withoutRatingToken } from './waybill-redaction.util';

const TOKEN = 'FO26000001-3f1c9a2e-0d3b-4c11-9d0f-8a2b6c4d5e6f';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'wb-1',
  companyId: 'co-1',
  trackingNumber: 'FO26000001',
  status: 'DELIVERED',
  ratingToken: TOKEN,
  customerRating: null,
  ...over,
});

describe('withoutRatingToken', () => {
  it('drops the rating token and keeps every other column', () => {
    const out = withoutRatingToken(row()) as Record<string, unknown>;

    expect(out).not.toHaveProperty('ratingToken');
    expect(out.id).toBe('wb-1');
    expect(out.trackingNumber).toBe('FO26000001');
    expect(out.status).toBe('DELIVERED');
    expect(out.customerRating).toBeNull();
    expect(Object.keys(out).sort()).toEqual(
      Object.keys(row())
        .filter((k) => k !== 'ratingToken')
        .sort(),
    );
  });

  it('keeps relations that came in through include', () => {
    const out = withoutRatingToken(
      row({ shipments: [{ id: 'sh-1', status: 'DELIVERED' }], inboxItem: null }) as any,
    ) as Record<string, unknown>;

    expect(out).not.toHaveProperty('ratingToken');
    expect(out.shipments).toEqual([{ id: 'sh-1', status: 'DELIVERED' }]);
    expect(out).toHaveProperty('inboxItem');
  });

  it('does not mutate the row it was given (internal consumers still see the token)', () => {
    const original = row();
    withoutRatingToken(original);

    expect(original.ratingToken).toBe(TOKEN);
  });

  it('is safe on rows that never had a token, and on null', () => {
    expect(withoutRatingToken(row({ ratingToken: null }))).not.toHaveProperty('ratingToken');
    expect(withoutRatingToken(null)).toBeNull();
    expect(withoutRatingToken(undefined)).toBeUndefined();
  });

  it('maps over a list without touching the source array', () => {
    const rows = [row(), row({ id: 'wb-2' })];
    const out = rows.map(withoutRatingToken) as Record<string, unknown>[];

    expect(out).toHaveLength(2);
    expect(out.every((r) => !('ratingToken' in r))).toBe(true);
    expect(rows[0].ratingToken).toBe(TOKEN);
  });
});
