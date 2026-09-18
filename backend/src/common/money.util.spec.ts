import { Money } from './money.util';

describe('Money', () => {
  describe('round', () => {
    it('rounds to 2 decimals', () => {
      expect(Money.round(1.005)).toBe(1.01);
      expect(Money.round(1.004)).toBe(1.0);
      expect(Money.round(2.675)).toBe(2.68); // the classic float-rounding trap
    });
    it('coerces junk to 0', () => {
      expect(Money.round(null)).toBe(0);
      expect(Money.round(undefined)).toBe(0);
      expect(Money.round('abc')).toBe(0);
      expect(Money.round('12.5')).toBe(12.5);
    });
  });

  describe('add / subtract — no float drift', () => {
    it('0.1 + 0.2 is exactly 0.30', () => {
      expect(Money.add(0.1, 0.2)).toBe(0.3); // plain float gives 0.30000000000000004
    });
    it('subtracts exactly', () => {
      expect(Money.subtract(0.3, 0.1)).toBe(0.2);
      expect(Money.subtract(250, 300)).toBe(-50);
    });
  });

  describe('sum — exact over many items', () => {
    it('sums a list without accumulating error', () => {
      const items = Array(10).fill(0.1); // 10 × 0.1 = 1.00 (float sum drifts)
      expect(Money.sum(items)).toBe(1.0);
    });
    it('sums invoice line totals', () => {
      expect(Money.sum([200, 50, 33.33, 16.67])).toBe(300);
    });
  });

  describe('multiply — unit price × quantity', () => {
    it('computes a line total exactly', () => {
      expect(Money.multiply(19.99, 3)).toBe(59.97);
      expect(Money.multiply(0.1, 3)).toBe(0.3);
    });
    it('supports fractional quantities', () => {
      expect(Money.multiply(100, 2.5)).toBe(250);
    });
  });

  describe('percent — VAT / commission', () => {
    it('computes 15% VAT exactly', () => {
      expect(Money.percent(250, 15)).toBe(37.5);
      expect(Money.percent(100, 15)).toBe(15);
    });
    it('handles 0%', () => {
      expect(Money.percent(100, 0)).toBe(0);
    });
  });

  describe('toCents — external systems (Paystack)', () => {
    it('converts to integer cents', () => {
      expect(Money.toCents(19.99)).toBe(1999);
      expect(Money.toCents(100)).toBe(10000);
      expect(Money.toCents(0.1)).toBe(10);
    });
  });

  describe('comparisons', () => {
    it('isEqual is exact to the cent', () => {
      expect(Money.isEqual(0.1 + 0.2, 0.3)).toBe(true);
      expect(Money.isEqual(10, 10.01)).toBe(false);
    });
    it('isGreater compares at cent precision', () => {
      expect(Money.isGreater(10.01, 10)).toBe(true);
      expect(Money.isGreater(10, 10)).toBe(false);
    });
    it('isClose respects a rand tolerance', () => {
      expect(Money.isClose(100, 100.009, 0.01)).toBe(true);
      expect(Money.isClose(100, 100.02, 0.01)).toBe(false);
    });
  });
});
