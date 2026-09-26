import {
  reconcileGoodsReceipt,
  shouldBlockCompletion,
  type ReceiptLineInput,
} from './goods-receipt.policy';

describe('Goods receipt reconciliation policy', () => {
  const cleanLine: ReceiptLineInput = {
    sku: 'SKU-00001',
    expectedQty: 100,
    receivedQty: 100,
    damagedQty: 0,
    putAwayBinId: 'bin-1',
  };

  it('calls an exact receipt clean', () => {
    const result = reconcileGoodsReceipt([cleanLine]);
    expect(result.outcome).toBe('CLEAN');
    expect(result.incidents).toEqual([]);
    expect(result.totals).toMatchObject({ expectedQty: 100, receivedQty: 100, goodQty: 100 });
  });

  it('absorbs differences inside the declared tolerance', () => {
    const result = reconcileGoodsReceipt([{ ...cleanLine, receivedQty: 99 }], {
      varianceTolerancePct: 2,
    });
    expect(result.outcome).toBe('CLEAN');
    expect(result.lines[0].hasVariance).toBe(false);
    expect(result.lines[0].variance).toBe(-1);
  });

  it('raises a non-blocking quantity variance beyond tolerance', () => {
    const result = reconcileGoodsReceipt([{ ...cleanLine, receivedQty: 95 }]);
    expect(result.outcome).toBe('EXCEPTION');
    const incident = result.incidents.find((i) => i.code === 'QUANTITY_VARIANCE');
    expect(incident).toBeDefined();
    expect(incident!.isBlocking).toBe(false);
    expect(incident!.severity).toBe('MAJOR');
    expect(incident!.detail).toContain('received 95 vs expected 100');
  });

  it('names an over-delivery as such', () => {
    const result = reconcileGoodsReceipt([{ ...cleanLine, receivedQty: 120 }]);
    expect(result.incidents[0].name).toBe('Over delivery');
    expect(result.lines[0].variance).toBe(20);
  });

  it('treats a receipt with no expected quantity as unmeasurable rather than short', () => {
    const result = reconcileGoodsReceipt([
      { sku: 'SKU-00009', expectedQty: null, receivedQty: 40, putAwayBinId: 'bin-9' },
    ]);
    expect(result.outcome).toBe('CLEAN');
    expect(result.lines[0].expectedQty).toBe(0);
  });

  it('raises damage as a major, non-blocking incident', () => {
    const result = reconcileGoodsReceipt([{ ...cleanLine, damagedQty: 4 }]);
    const incident = result.incidents.find((i) => i.code === 'DAMAGED_GOODS');
    expect(incident!.severity).toBe('MAJOR');
    expect(incident!.isBlocking).toBe(false);
    expect(result.lines[0].goodQty).toBe(96);
  });

  it('escalates to critical and blocking when nothing usable arrived', () => {
    const result = reconcileGoodsReceipt([{ ...cleanLine, damagedQty: 100 }]);
    const incident = result.incidents.find((i) => i.code === 'DAMAGED_GOODS');
    expect(incident!.severity).toBe('CRITICAL');
    expect(incident!.isBlocking).toBe(true);
    expect(result.lines[0].goodQty).toBe(0);
  });

  it('never counts more damaged units than were received', () => {
    const result = reconcileGoodsReceipt([{ ...cleanLine, receivedQty: 10, damagedQty: 99 }]);
    expect(result.lines[0].damagedQty).toBe(10);
    expect(result.lines[0].goodQty).toBe(0);
  });

  it('blocks when good stock has no put-away location', () => {
    const result = reconcileGoodsReceipt([{ ...cleanLine, putAwayBinId: null }]);
    const incident = result.incidents.find((i) => i.code === 'PUT_AWAY_MISSING');
    expect(incident!.isBlocking).toBe(true);
    expect(result.outcome).toBe('EXCEPTION');
  });

  it('does not require put-away when the caller opts out', () => {
    const result = reconcileGoodsReceipt([{ ...cleanLine, putAwayBinId: null }], {
      requirePutAway: false,
    });
    expect(result.outcome).toBe('CLEAN');
  });

  it('blocks an unknown SKU — stock may not be booked to unmanaged master data', () => {
    const result = reconcileGoodsReceipt([{ ...cleanLine, knownVariant: false }]);
    const incident = result.incidents.find((i) => i.code === 'UNKNOWN_SKU');
    expect(incident!.isBlocking).toBe(true);
    expect(incident!.detail).toContain('did not resolve to an approved product variant');
  });

  it('aggregates totals across lines and multiple problems', () => {
    const result = reconcileGoodsReceipt([
      { ...cleanLine, receivedQty: 95, damagedQty: 2 },
      { sku: 'SKU-00002', expectedQty: 50, receivedQty: 50, damagedQty: 0, putAwayBinId: 'bin-2' },
      { sku: 'SKU-00003', expectedQty: 10, receivedQty: 10, damagedQty: 0, putAwayBinId: null, knownVariant: false },
    ]);

    expect(result.lines).toHaveLength(3);
    expect(result.totals.expectedQty).toBe(160);
    expect(result.totals.receivedQty).toBe(155);
    expect(result.totals.damagedQty).toBe(2);
    expect(result.totals.goodQty).toBe(153);

    const codes = result.incidents.map((i) => i.code).sort();
    expect(codes).toEqual(['DAMAGED_GOODS', 'PUT_AWAY_MISSING', 'QUANTITY_VARIANCE', 'UNKNOWN_SKU']);
  });

  describe('enforcement', () => {
    const exception = reconcileGoodsReceipt([{ ...cleanLine, putAwayBinId: null }]);

    it('observes but does not block while piloting', () => {
      expect(shouldBlockCompletion(exception, false).blocked).toBe(false);
    });

    it('blocks completion when enforcing', () => {
      const decision = shouldBlockCompletion(exception, true);
      expect(decision.blocked).toBe(true);
      expect(decision.reason).toContain('PUT_AWAY_MISSING');
    });

    it('never blocks a clean receipt', () => {
      const clean = reconcileGoodsReceipt([cleanLine]);
      expect(shouldBlockCompletion(clean, true).blocked).toBe(false);
    });

    it('does not block on non-blocking incidents even when enforcing', () => {
      const varianceOnly = reconcileGoodsReceipt([{ ...cleanLine, receivedQty: 90 }]);
      expect(shouldBlockCompletion(varianceOnly, true).blocked).toBe(false);
    });
  });
});
