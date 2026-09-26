import {
  assertSequenceProgresses,
  buildSkuAllocation,
  canApproveProduct,
  canApproveVariant,
  checkRevision,
  computeAttributeFingerprint,
  computeProductFingerprint,
  formatSku,
  isProductEditable,
  isValidBarcode,
  isVariantEditable,
  normalizeAliasForType,
  normalizeAttributes,
  productMasterGate,
  requiresNewRevision,
  validateAliasTarget,
} from './sku.policy';

describe('Product master / SKU policy', () => {
  describe('approval ordering', () => {
    it('refuses to approve a variant before its product is approved', () => {
      expect(canApproveVariant('DRAFT').ok).toBe(false);
      expect(canApproveVariant('PENDING_APPROVAL').ok).toBe(false);
      expect(canApproveVariant('REJECTED').ok).toBe(false);
      expect(canApproveVariant('DRAFT').reason).toContain('APPROVED');
    });

    it('allows variant approval under an approved product', () => {
      expect(canApproveVariant('APPROVED').ok).toBe(true);
    });

    it('only approves a product from draft or pending', () => {
      expect(canApproveProduct('DRAFT')).toBe(true);
      expect(canApproveProduct('PENDING_APPROVAL')).toBe(true);
      expect(canApproveProduct('APPROVED')).toBe(false);
      expect(canApproveProduct('RETIRED')).toBe(false);
    });

    it('locks approved records and requires a new revision to change them', () => {
      expect(isProductEditable('APPROVED')).toBe(false);
      expect(isVariantEditable('APPROVED')).toBe(false);
      expect(requiresNewRevision('APPROVED')).toBe(true);
      expect(requiresNewRevision('DRAFT')).toBe(false);
    });
  });

  describe('optimistic concurrency', () => {
    it('accepts a caller with the current revision', () => {
      expect(checkRevision(3, 3).ok).toBe(true);
    });

    it('rejects a stale revision with an actionable message', () => {
      const result = checkRevision(4, 3);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Stale revision');
      expect(result.reason).toContain('4');
    });

    it('does not require a revision when the caller omits one', () => {
      expect(checkRevision(4).ok).toBe(true);
    });
  });

  describe('attribute fingerprinting', () => {
    it('treats cosmetic differences as the same variant', () => {
      const a = computeAttributeFingerprint({ colour: 'Red', size: 'L' });
      const b = computeAttributeFingerprint({ colour: '  red ', size: 'l' });
      expect(a).toBe(b);
    });

    it('ignores attribute order and key case', () => {
      const a = computeAttributeFingerprint({ Colour: 'Red', Size: 'L' });
      const b = computeAttributeFingerprint({ size: 'L', colour: 'Red' });
      expect(a).toBe(b);
    });

    it('treats numeric strings and numbers as equal', () => {
      expect(computeAttributeFingerprint({ packSize: 12 })).toBe(
        computeAttributeFingerprint({ packSize: '12' }),
      );
    });

    it('treats attribute arrays as unordered sets', () => {
      expect(computeAttributeFingerprint({ tags: ['a', 'b'] })).toBe(
        computeAttributeFingerprint({ tags: ['b', 'a'] }),
      );
    });

    it('distinguishes genuinely different variants', () => {
      expect(computeAttributeFingerprint({ colour: 'Red' })).not.toBe(
        computeAttributeFingerprint({ colour: 'Blue' }),
      );
    });

    it('normalises nested objects deterministically', () => {
      expect(normalizeAttributes({ pack: { units: 6, unit: 'EA' } })).toEqual({
        pack: { unit: 'ea', units: 6 },
      });
    });

    it('fingerprints products on their defining fields', () => {
      const a = computeProductFingerprint({ name: 'Vaccine Pack', brand: 'Acme', unitOfMeasure: 'EA' });
      const b = computeProductFingerprint({ name: 'vaccine pack ', brand: 'acme', unitOfMeasure: 'ea' });
      expect(a).toBe(b);
      expect(a).not.toBe(computeProductFingerprint({ name: 'Vaccine Pack', brand: 'Other' }));
    });
  });

  describe('SKU formatting', () => {
    it('zero-pads to the width declared in the format', () => {
      expect(formatSku(1)).toBe('SKU-00001');
      expect(formatSku(42)).toBe('SKU-00042');
      expect(formatSku(123456)).toBe('SKU-123456');
    });

    it('renders a custom prefix and format', () => {
      expect(formatSku(7, { prefix: 'JHB', format: '{prefix}-{number:04d}' })).toBe('JHB-0007');
    });

    it('rejects a non-positive or fractional sequence number', () => {
      expect(() => formatSku(0)).toThrow();
      expect(() => formatSku(-3)).toThrow();
      expect(() => formatSku(1.5)).toThrow();
    });

    it('allocates and advances the sequence in one step', () => {
      const allocation = buildSkuAllocation({ nextNumber: 4 });
      expect(allocation.sku).toBe('SKU-00004');
      expect(allocation.nextNumber).toBe(5);
    });

    it('refuses any allocation that would move the sequence backwards', () => {
      expect(() => assertSequenceProgresses(5, 4)).toThrow(/must advance/);
      expect(() => assertSequenceProgresses(5, 5)).toThrow();
      expect(() => assertSequenceProgresses(5, 6)).not.toThrow();
    });

    it('honours a tenant-configured prefix/format on the sequence row', () => {
      const allocation = buildSkuAllocation({ nextNumber: 12, prefix: 'CPT', format: '{prefix}{number:06d}' });
      expect(allocation.sku).toBe('CPT000012');
    });
  });

  describe('aliases', () => {
    it('requires exactly one target', () => {
      expect(validateAliasTarget({ productId: 'p1' }).ok).toBe(true);
      expect(validateAliasTarget({ variantId: 'v1' }).ok).toBe(true);
      expect(validateAliasTarget({ productId: 'p1', variantId: 'v1' }).ok).toBe(false);
      expect(validateAliasTarget({}).ok).toBe(false);
    });

    it('normalises codes but preserves barcode leading zeros', () => {
      expect(normalizeAliasForType('SUPPLIER_CODE', '  ACME-12 ')).toBe('acme-12');
      expect(normalizeAliasForType('BARCODE', ' 0012345678905 ')).toBe('0012345678905');
    });

    it('validates barcode shape', () => {
      expect(isValidBarcode('12345678')).toBe(true);
      expect(isValidBarcode('12345678901234')).toBe(true);
      expect(isValidBarcode('123')).toBe(false);
      expect(isValidBarcode('12ab5678')).toBe(false);
    });
  });

  describe('feature gate', () => {
    it('is off by default', () => {
      expect(productMasterGate({}).allowed).toBe(false);
    });

    it('follows the process-control flag when its own flag is unset', () => {
      expect(productMasterGate({ PROCESS_CONTROL_ENABLED: 'true' }).allowed).toBe(true);
      expect(productMasterGate({ PRODUCT_MASTER_ENABLED: 'true' }).allowed).toBe(true);
    });

    it('fails closed in production', () => {
      const gate = productMasterGate({
        NODE_ENV: 'production',
        PRODUCT_MASTER_ENABLED: 'true',
      });
      expect(gate.allowed).toBe(false);
      expect(gate.reason).toContain('production');
      expect(
        productMasterGate({
          NODE_ENV: 'production',
          PRODUCT_MASTER_ENABLED: 'true',
          PRODUCT_MASTER_PRODUCTION_ALLOWED: 'true',
        }).allowed,
      ).toBe(true);
    });
  });
});
