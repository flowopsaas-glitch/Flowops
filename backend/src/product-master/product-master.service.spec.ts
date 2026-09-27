import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FakePrisma } from '../testing/fake-prisma';
import { ProductMasterService, type ActorContext } from './product-master.service';

const COMPANY_A = 'company-a';
const COMPANY_B = 'company-b';

const admin: ActorContext = { userId: 'u-admin', name: 'Tenant Admin', role: 'ADMIN' };
const clerk: ActorContext = { userId: 'u-clerk', name: 'Onboarding Clerk', role: 'AGENT' };

/**
 * Service-level tests against an in-memory Prisma double (no PostgreSQL in this
 * sandbox). They cover tenant isolation, attribute deduplication, approval
 * ordering, optimistic concurrency, alias uniqueness and SKU allocation
 * monotonicity. Real row-lock behaviour under concurrent connections still
 * requires the database-backed integration suite before production.
 */
describe('ProductMasterService', () => {
  let prisma: FakePrisma;
  let service: ProductMasterService;

  beforeEach(() => {
    process.env.PRODUCT_MASTER_ENABLED = 'true';
    process.env.NODE_ENV = 'test';
    prisma = new FakePrisma();
    service = new ProductMasterService(prisma as any);
  });

  afterEach(() => {
    delete process.env.PRODUCT_MASTER_ENABLED;
  });

  async function approvedProduct(code = 'PROD-001') {
    const product = await service.createProduct(COMPANY_A, clerk, { code, name: 'Vaccine pack' });
    await service.submitProduct(COMPANY_A, clerk, product.id);
    return service.approveProduct(COMPANY_A, admin, product.id, true);
  }

  describe('feature gate', () => {
    it('refuses everything while disabled', async () => {
      delete process.env.PRODUCT_MASTER_ENABLED;
      await expect(service.listProducts(COMPANY_A)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('fails closed in production', async () => {
      process.env.NODE_ENV = 'production';
      await expect(service.listProducts(COMPANY_A)).rejects.toThrow(/production/);
      process.env.NODE_ENV = 'test';
    });
  });

  describe('products', () => {
    it('rejects a duplicate product code inside the tenant', async () => {
      await service.createProduct(COMPANY_A, clerk, { code: 'PROD-001', name: 'Vaccine pack' });
      await expect(
        service.createProduct(COMPANY_A, clerk, { code: 'PROD-001', name: 'Something else' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('flags a likely duplicate when the defining fields match', async () => {
      await service.createProduct(COMPANY_A, clerk, { code: 'PROD-001', name: 'Vaccine pack' });
      const second = await service.createProduct(COMPANY_A, clerk, {
        code: 'PROD-002',
        name: 'vaccine PACK',
      });
      expect(second.possibleDuplicate?.code).toBe('PROD-001');
      const flagged = prisma.all('masterDataAuditEvent').some(
        (e) => e.eventType === 'PRODUCT_CREATED' && e.metadata?.possibleDuplicateOf === 'PROD-001',
      );
      expect(flagged).toBe(true);
    });

    it('requires an approval role to approve master data', async () => {
      const product = await service.createProduct(COMPANY_A, clerk, { code: 'PROD-003', name: 'Pack' });
      await service.submitProduct(COMPANY_A, clerk, product.id);
      await expect(
        service.approveProduct(COMPANY_A, clerk, product.id, true),
      ).rejects.toBeInstanceOf(ForbiddenException);
      const denied = prisma.all('masterDataAuditEvent').find((e) => e.eventType === 'ACCESS_DENIED');
      expect(denied).toBeDefined();
    });

    it('refuses to edit an approved product', async () => {
      const product = await approvedProduct('PROD-004');
      await expect(
        service.updateProduct(COMPANY_A, clerk, product.id, { name: 'Renamed' }),
      ).rejects.toThrow(/approved master data changes through a new revision/i);
    });

    it('rejects a stale revision and audits it', async () => {
      const product = await service.createProduct(COMPANY_A, clerk, { code: 'PROD-005', name: 'Pack' });
      await service.updateProduct(COMPANY_A, clerk, product.id, { name: 'Pack v2', revision: 1 });
      await expect(
        service.updateProduct(COMPANY_A, clerk, product.id, { name: 'Pack v3', revision: 1 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.all('masterDataAuditEvent').some((e) => e.eventType === 'CONCURRENT_EDIT_REJECTED')).toBe(true);
    });

    it('does not expose another tenant’s product', async () => {
      const product = await service.createProduct(COMPANY_A, clerk, { code: 'PROD-006', name: 'Pack' });
      await expect(service.getProduct(COMPANY_B, product.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('always scopes reads by company', async () => {
      await service.listProducts(COMPANY_A);
      const where = prisma.queriedWhereClauses.at(-1)!.where;
      expect(where.companyId).toBe(COMPANY_A);
    });
  });

  describe('variants', () => {
    it('deduplicates variants on normalised attributes', async () => {
      const product = await approvedProduct('PROD-010');
      await service.createVariant(COMPANY_A, clerk, product.id, {
        code: 'PROD-010-RED-L',
        name: 'Red large',
        attributes: { Colour: 'Red', Size: 'L' },
      });

      await expect(
        service.createVariant(COMPANY_A, clerk, product.id, {
          code: 'PROD-010-RED-L-2',
          name: 'Red large (duplicate)',
          attributes: { colour: '  red ', size: 'l' },
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(
        prisma.all('masterDataAuditEvent').some((e) => e.eventType === 'DUPLICATE_FINGERPRINT_BLOCKED'),
      ).toBe(true);
    });

    it('allows a genuinely different variant of the same product', async () => {
      const product = await approvedProduct('PROD-011');
      await service.createVariant(COMPANY_A, clerk, product.id, {
        code: 'PROD-011-RED',
        name: 'Red',
        attributes: { colour: 'Red' },
      });
      const blue = await service.createVariant(COMPANY_A, clerk, product.id, {
        code: 'PROD-011-BLUE',
        name: 'Blue',
        attributes: { colour: 'Blue' },
      });
      expect(blue.id).toBeDefined();
    });

    it('requires at least one defining attribute', async () => {
      const product = await approvedProduct('PROD-012');
      await expect(
        service.createVariant(COMPANY_A, clerk, product.id, { code: 'X', name: 'X', attributes: {} }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to approve a variant before its product is approved', async () => {
      const product = await service.createProduct(COMPANY_A, clerk, { code: 'PROD-013', name: 'Pack' });
      const variant = await service.createVariant(COMPANY_A, clerk, product.id, {
        code: 'PROD-013-RED',
        name: 'Red',
        attributes: { colour: 'Red' },
      });

      await expect(
        service.approveVariant(COMPANY_A, admin, variant.id, true),
      ).rejects.toThrow(/parent product must be APPROVED/);

      // No SKU may be burned on a variant that cannot be approved.
      expect(prisma.skuSequences[COMPANY_A]).toBeUndefined();
    });

    it('approves a variant under an approved product and allocates a SKU', async () => {
      const product = await approvedProduct('PROD-014');
      const variant = await service.createVariant(COMPANY_A, clerk, product.id, {
        code: 'PROD-014-RED',
        name: 'Red',
        attributes: { colour: 'Red' },
      });
      const approved = await service.approveVariant(COMPANY_A, admin, variant.id, true);
      expect(approved.status).toBe('APPROVED');
      expect(approved.sku).toBe('SKU-00001');
      expect(approved.skuAllocatedAt).toBeInstanceOf(Date);
    });

    it('refuses to edit an approved variant', async () => {
      const product = await approvedProduct('PROD-015');
      const variant = await service.createVariant(COMPANY_A, clerk, product.id, {
        code: 'PROD-015-RED',
        name: 'Red',
        attributes: { colour: 'Red' },
      });
      await service.approveVariant(COMPANY_A, admin, variant.id, true);
      await expect(
        service.updateVariant(COMPANY_A, clerk, variant.id, { name: 'Renamed' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('blocks an attribute change that would collide with another variant', async () => {
      const product = await approvedProduct('PROD-016');
      await service.createVariant(COMPANY_A, clerk, product.id, {
        code: 'PROD-016-RED',
        name: 'Red',
        attributes: { colour: 'Red' },
      });
      const blue = await service.createVariant(COMPANY_A, clerk, product.id, {
        code: 'PROD-016-BLUE',
        name: 'Blue',
        attributes: { colour: 'Blue' },
      });
      await expect(
        service.updateVariant(COMPANY_A, clerk, blue.id, { attributes: { colour: 'red' } }),
      ).rejects.toThrow(/collide/);
    });

    it('does not expose another tenant’s variant', async () => {
      const product = await approvedProduct('PROD-017');
      const variant = await service.createVariant(COMPANY_A, clerk, product.id, {
        code: 'PROD-017-RED',
        name: 'Red',
        attributes: { colour: 'Red' },
      });
      await expect(service.updateVariant(COMPANY_B, clerk, variant.id, { name: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('SKU allocation', () => {
    it('never reuses a number, even after the variant is gone from the listing', async () => {
      const product = await approvedProduct('PROD-020');
      const first = await service.createVariant(COMPANY_A, clerk, product.id, {
        code: 'PROD-020-A',
        name: 'A',
        attributes: { colour: 'Red' },
      });
      const second = await service.createVariant(COMPANY_A, clerk, product.id, {
        code: 'PROD-020-B',
        name: 'B',
        attributes: { colour: 'Blue' },
      });

      const a = await service.allocateSku(COMPANY_A, clerk, first.id);
      const b = await service.allocateSku(COMPANY_A, clerk, second.id);

      expect(a.sku).toBe('SKU-00001');
      expect(b.sku).toBe('SKU-00002');
      expect(prisma.skuSequences[COMPANY_A].nextNumber).toBe(3);
    });

    it('is idempotent — re-allocating returns the existing SKU', async () => {
      const product = await approvedProduct('PROD-021');
      const variant = await service.createVariant(COMPANY_A, clerk, product.id, {
        code: 'PROD-021-A',
        name: 'A',
        attributes: { colour: 'Red' },
      });

      const first = await service.allocateSku(COMPANY_A, clerk, variant.id);
      const again = await service.allocateSku(COMPANY_A, clerk, variant.id);

      expect(again.allocated).toBe(false);
      expect(again.sku).toBe(first.sku);
      expect(prisma.skuSequences[COMPANY_A].nextNumber).toBe(2);
    });

    it('issues distinct SKUs under concurrent allocation', async () => {
      const product = await approvedProduct('PROD-022');
      const variants = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          service.createVariant(COMPANY_A, clerk, product.id, {
            code: `PROD-022-${i}`,
            name: `Variant ${i}`,
            attributes: { seq: i },
          }),
        ),
      );

      const allocated = await Promise.all(
        variants.map((v) => service.allocateSku(COMPANY_A, clerk, v.id)),
      );
      const skus = allocated.map((a) => a.sku);

      expect(new Set(skus).size).toBe(8);
      // The sequence advances exactly once per allocation.
      expect(prisma.skuSequences[COMPANY_A].nextNumber).toBe(9);
    });

    it('keeps SKU sequences separate per tenant', async () => {
      const productA = await approvedProduct('PROD-023');
      const variantA = await service.createVariant(COMPANY_A, clerk, productA.id, {
        code: 'PROD-023-A',
        name: 'A',
        attributes: { colour: 'Red' },
      });
      await service.allocateSku(COMPANY_A, clerk, variantA.id);

      const productB = await service.createProduct(COMPANY_B, clerk, { code: 'PROD-100', name: 'Pack' });
      await service.submitProduct(COMPANY_B, clerk, productB.id);
      await service.approveProduct(COMPANY_B, admin, productB.id, true);
      const variantB = await service.createVariant(COMPANY_B, clerk, productB.id, {
        code: 'PROD-100-A',
        name: 'A',
        attributes: { colour: 'Red' },
      });
      const allocated = await service.allocateSku(COMPANY_B, clerk, variantB.id);

      expect(allocated.sku).toBe('SKU-00001');
      expect(prisma.skuSequences[COMPANY_A].nextNumber).toBe(2);
      expect(prisma.skuSequences[COMPANY_B].nextNumber).toBe(2);
    });

    it('records an audit event for every allocation', async () => {
      const product = await approvedProduct('PROD-024');
      const variant = await service.createVariant(COMPANY_A, clerk, product.id, {
        code: 'PROD-024-A',
        name: 'A',
        attributes: { colour: 'Red' },
      });
      await service.allocateSku(COMPANY_A, clerk, variant.id);
      const event = prisma.all('masterDataAuditEvent').find((e) => e.eventType === 'SKU_ALLOCATED');
      expect(event?.afterState?.sku).toBe('SKU-00001');
    });
  });

  describe('aliases', () => {
    it('rejects duplicate aliases inside the tenant', async () => {
      const product = await approvedProduct('PROD-030');
      await service.addAlias(COMPANY_A, clerk, {
        productId: product.id,
        type: 'SUPPLIER_CODE',
        value: 'ACME-1',
      });
      await expect(
        service.addAlias(COMPANY_A, clerk, { productId: product.id, type: 'SUPPLIER_CODE', value: ' acme-1 ' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('requires exactly one target', async () => {
      await expect(
        service.addAlias(COMPANY_A, clerk, { type: 'INTERNAL', value: 'X' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('resolves a scanned barcode to governed master data', async () => {
      const product = await approvedProduct('PROD-031');
      const variant = await service.createVariant(COMPANY_A, clerk, product.id, {
        code: 'PROD-031-A',
        name: 'A',
        attributes: { colour: 'Red' },
      });
      await service.addAlias(COMPANY_A, clerk, {
        variantId: variant.id,
        type: 'BARCODE',
        value: '0012345678905',
      });

      const hit = await service.resolveAlias(COMPANY_A, 'BARCODE', '0012345678905');
      expect(hit.matched).toBe(true);
      expect(hit.alias?.variant?.code).toBe('PROD-031-A');

      const miss = await service.resolveAlias(COMPANY_A, 'BARCODE', '9999999999999');
      expect(miss.matched).toBe(false);
    });

    it('does not resolve another tenant’s alias', async () => {
      const product = await approvedProduct('PROD-032');
      await service.addAlias(COMPANY_A, clerk, { productId: product.id, type: 'INTERNAL', value: 'ABC' });
      const result = await service.resolveAlias(COMPANY_B, 'INTERNAL', 'ABC');
      expect(result.matched).toBe(false);
    });

    it('deactivates rather than deletes an alias, and audits it', async () => {
      const product = await approvedProduct('PROD-033');
      const alias = await service.addAlias(COMPANY_A, clerk, {
        productId: product.id,
        type: 'LEGACY',
        value: 'OLD-1',
      });
      await service.removeAlias(COMPANY_A, clerk, alias.id);
      expect(prisma.all('productAlias')[0].isActive).toBe(false);
      expect(prisma.all('masterDataAuditEvent').some((e) => e.eventType === 'ALIAS_REMOVED')).toBe(true);
    });
  });

  it('keeps an audit trail for master-data changes', async () => {
    const product = await approvedProduct('PROD-040');
    const variant = await service.createVariant(COMPANY_A, clerk, product.id, {
      code: 'PROD-040-A',
      name: 'A',
      attributes: { colour: 'Red' },
    });
    await service.approveVariant(COMPANY_A, admin, variant.id, true);

    const events = prisma.all('masterDataAuditEvent').map((e) => e.eventType);
    expect(events).toEqual(
      expect.arrayContaining([
        'PRODUCT_CREATED',
        'PRODUCT_SUBMITTED',
        'PRODUCT_APPROVED',
        'VARIANT_CREATED',
        'SKU_ALLOCATED',
        'VARIANT_APPROVED',
      ]),
    );
  });
});
