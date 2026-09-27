/**
 * Product / Variant / SKU master data against a real PostgreSQL.
 *
 * SKU allocation depends entirely on behaviour an in-memory double cannot
 * reproduce: a `SELECT … FOR UPDATE` on the per-tenant sequence row inside a
 * transaction, plus the unique indexes that stop a number being handed out
 * twice. That is what this suite exercises.
 *
 * Covered here (the §9.3 list in the implementation charter):
 *   • concurrent approvals allocate distinct, monotonic SKUs
 *   • a SKU is never duplicated or reused
 *   • duplicate variant attributes are refused (normalised fingerprint)
 *   • a variant cannot be approved before its product
 *   • cross-tenant reads and writes are refused
 *   • master-data audit records are written
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  ProductMasterService,
  type ActorContext,
} from '../../src/product-master/product-master.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { seedTenant, truncateAll } from './support/db';
import { createIntegrationDatabase, type IntegrationDatabase } from './support/prisma-client';

const admin: ActorContext = { userId: 'user-admin', name: 'Tenant Admin', role: 'ADMIN' };
const clerk: ActorContext = { userId: 'user-clerk', name: 'Onboarding Clerk', role: 'AGENT' };

jest.setTimeout(60_000);

describe('Product Master (PostgreSQL)', () => {
  let db: IntegrationDatabase;
  let prisma: PrismaClient;
  let service: ProductMasterService;
  let companyId: string;

  beforeAll(async () => {
    db = await createIntegrationDatabase();
    prisma = db.prisma;
    service = new ProductMasterService(prisma as unknown as PrismaService);
    // eslint-disable-next-line no-console
    console.log(`[integration] product-master engine: ${db.engine}`);
  });

  afterAll(async () => {
    await db?.shutdown();
  });

  beforeEach(async () => {
    process.env.PRODUCT_MASTER_ENABLED = 'true';
    process.env.PROCESS_CONTROL_ENABLED = 'true';
    delete process.env.PRODUCT_MASTER_PRODUCTION_ALLOWED;
    process.env.NODE_ENV = 'test';

    await truncateAll(prisma);
    ({ companyId } = await seedTenant(prisma, 'Master Data Tenant'));
  });

  afterEach(() => {
    delete process.env.PRODUCT_MASTER_ENABLED;
    delete process.env.PROCESS_CONTROL_ENABLED;
  });

  /** Create → submit → approve, the only path that makes a product governable. */
  async function approvedProduct(code = 'PROD-001') {
    const product = await service.createProduct(companyId, clerk, {
      code,
      name: 'Vaccine pack',
    });
    await service.submitProduct(companyId, clerk, product.id);
    return service.approveProduct(companyId, admin, product.id, true);
  }

  describe('SKU allocation', () => {
    it('allocates a distinct, monotonic SKU for every variant approved concurrently', async () => {
      const product = await approvedProduct('PROD-CONCURRENT');

      const variants = [];
      for (let i = 1; i <= 5; i++) {
        variants.push(
          await service.createVariant(companyId, clerk, product.id, {
            code: `PROD-CONCURRENT-${i}`,
            name: `Variant ${i}`,
            attributes: { packSize: i, unit: 'box' },
          }),
        );
      }

      const approvals = await Promise.allSettled(
        variants.map((variant) => service.approveVariant(companyId, admin, variant.id, true)),
      );

      expect(
        approvals
          .filter((a) => a.status === 'rejected')
          .map((a) => String((a as PromiseRejectedResult).reason?.message)),
      ).toEqual([]);

      const approved = await prisma.productVariant.findMany({
        where: { companyId, productId: product.id },
        orderBy: { code: 'asc' },
      });

      const skus = approved.map((v) => v.sku);
      expect(skus.filter((sku) => !sku)).toEqual([]);
      expect(new Set(skus).size).toBe(5);
      expect(skus.every((sku) => /^SKU-\d{5}$/.test(sku as string))).toBe(true);
      expect(approved.every((v) => v.status === 'APPROVED')).toBe(true);
      expect(approved.every((v) => v.skuAllocatedAt !== null)).toBe(true);

      // The tenant sequence moved forward exactly once per allocation.
      const sequence = await prisma.skuSequence.findUniqueOrThrow({ where: { companyId } });
      expect(sequence.nextNumber).toBe(6);
    });

    /**
     * The bootstrap race, repeated. `sku_sequences` has two unique arbiters — the primary
     * key on `id` and the unique index on `companyId` — and the bootstrap insert used to
     * name only `("companyId")`. A caller that lost the creation race could then be
     * reported as a `sku_sequences_pkey` violation (23505) instead of falling through to
     * the row lock and reading the winner's row. Untargeted `ON CONFLICT DO NOTHING`
     * covers both arbiters. Each round drops the sequence row, so every round starts
     * exactly where a tenant's first-ever allocation does.
     */
    it('bootstraps the tenant sequence once however many first allocations race', async () => {
      const product = await approvedProduct('PROD-BOOTSTRAP');
      const variants = [];
      for (let i = 1; i <= 5; i++) {
        variants.push(
          await service.createVariant(companyId, clerk, product.id, {
            code: `PROD-BOOTSTRAP-${i}`,
            name: `Bootstrap variant ${i}`,
            attributes: { packSize: 100 + i, unit: 'box' },
          }),
        );
      }

      for (let round = 0; round < 10; round++) {
        await prisma.skuSequence.deleteMany({ where: { companyId } });
        await prisma.productVariant.updateMany({
          where: { companyId, productId: product.id },
          data: { sku: null, skuAllocatedAt: null },
        });

        const results = await Promise.allSettled(
          variants.map((variant) => service.allocateSku(companyId, admin, variant.id)),
        );

        expect(
          results
            .filter((r) => r.status === 'rejected')
            .map((r) => String((r as PromiseRejectedResult).reason?.message)),
        ).toEqual([]);

        const skus = results.map(
          (r) => (r as PromiseFulfilledResult<{ sku: string }>).value.sku,
        );
        expect(skus.filter((sku) => !sku)).toEqual([]);
        expect(new Set(skus).size).toBe(5);
        expect(skus.every((sku) => /^SKU-\d{5}$/.test(sku))).toBe(true);

        // Losing the race must never leave a second sequence row behind.
        expect(await prisma.skuSequence.count({ where: { companyId } })).toBe(1);
      }
    });

    it('never hands the same SKU to two tenants, and keeps counters per tenant', async () => {
      const other = await seedTenant(prisma, 'Second Tenant');

      const mine = await approvedProduct('PROD-T1');
      const mineVariant = await service.createVariant(companyId, clerk, mine.id, {
        code: 'V-1',
        name: 'Variant',
        attributes: { size: 'L' },
      });
      const mineApproved = await service.approveVariant(companyId, admin, mineVariant.id, true);

      const theirProduct = await service.createProduct(other.companyId, clerk, {
        code: 'PROD-T2',
        name: 'Their pack',
      });
      await service.submitProduct(other.companyId, clerk, theirProduct.id);
      await service.approveProduct(other.companyId, admin, theirProduct.id, true);
      const theirVariant = await service.createVariant(other.companyId, clerk, theirProduct.id, {
        code: 'V-1',
        name: 'Variant',
        attributes: { size: 'L' },
      });
      const theirApproved = await service.approveVariant(
        other.companyId,
        admin,
        theirVariant.id,
        true,
      );

      // Each tenant starts at 1 — numbering is per tenant, not global.
      expect(mineApproved.sku).toBe('SKU-00001');
      expect(theirApproved.sku).toBe('SKU-00001');

      const mineSequence = await prisma.skuSequence.findUniqueOrThrow({ where: { companyId } });
      const theirSequence = await prisma.skuSequence.findUniqueOrThrow({
        where: { companyId: other.companyId },
      });
      expect(mineSequence.id).not.toBe(theirSequence.id);
      expect(theirSequence.nextNumber).toBe(2);
    });

    it('keeps the SKU unique index authoritative when allocation is raced at the database level', async () => {
      const product = await approvedProduct('PROD-RACE');
      const variant = await service.createVariant(companyId, clerk, product.id, {
        code: 'RACE-1',
        name: 'Race variant',
        attributes: { size: 'M' },
      });

      // The same variant approved concurrently: one allocation wins, the losers
      // observe the SKU already assigned and do not burn a number.
      const results = await Promise.allSettled([
        service.approveVariant(companyId, admin, variant.id, true),
        service.approveVariant(companyId, admin, variant.id, true),
        service.approveVariant(companyId, admin, variant.id, true),
      ]);

      expect(results.some((r) => r.status === 'fulfilled')).toBe(true);

      const fresh = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
      expect(fresh.sku).toBe('SKU-00001');

      const sequence = await prisma.skuSequence.findUniqueOrThrow({ where: { companyId } });
      // Either 2 (a loser allocated then observed) — the invariant that matters is
      // that no second number was consumed for this one variant.
      expect(sequence.nextNumber).toBeLessThanOrEqual(2);

      const duplicated = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count FROM (
          SELECT sku FROM product_variants WHERE "companyId" = ${companyId} AND sku IS NOT NULL
          GROUP BY sku HAVING count(*) > 1
        ) dupes
      `;
      expect(Number(duplicated[0].count)).toBe(0);
    });
  });

  describe('deduplication and approval order', () => {
    it('refuses a second variant whose normalised attributes already exist', async () => {
      const product = await approvedProduct('PROD-DEDUPE');
      await service.createVariant(companyId, clerk, product.id, {
        code: 'DEDUPE-1',
        name: 'Red large',
        attributes: { colour: 'red', size: 'L' },
      });

      await expect(
        service.createVariant(companyId, clerk, product.id, {
          code: 'DEDUPE-2',
          name: 'Large red',
          // Same attributes, different key order — must still be a duplicate.
          attributes: { size: 'L', colour: 'red' },
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(await prisma.productVariant.count({ where: { companyId } })).toBe(1);

      const blocked = await prisma.masterDataAuditEvent.findFirst({
        where: { companyId, eventType: 'DUPLICATE_FINGERPRINT_BLOCKED' },
      });
      expect(blocked).not.toBeNull();
    });

    it('refuses to approve a variant while its product is still a draft', async () => {
      const product = await service.createProduct(companyId, clerk, {
        code: 'PROD-DRAFT',
        name: 'Not yet approved',
      });
      const variant = await service.createVariant(companyId, clerk, product.id, {
        code: 'DRAFT-1',
        name: 'Variant',
        attributes: { size: 'S' },
      });

      await expect(
        service.approveVariant(companyId, admin, variant.id, true),
      ).rejects.toThrow(/product|approved/i);

      const fresh = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
      expect(fresh.status).toBe('DRAFT');
      expect(fresh.sku).toBeNull();
    });

    it('refuses a duplicate product code inside one tenant but allows it in another', async () => {
      await service.createProduct(companyId, clerk, { code: 'PROD-DUP', name: 'Pack' });

      await expect(
        service.createProduct(companyId, clerk, { code: 'PROD-DUP', name: 'Other pack' }),
      ).rejects.toBeInstanceOf(ConflictException);

      const other = await seedTenant(prisma, 'Other Tenant');
      const theirs = await service.createProduct(other.companyId, clerk, {
        code: 'PROD-DUP',
        name: 'Pack',
      });
      expect(theirs.id).toBeDefined();
    });
  });

  describe('tenant isolation', () => {
    it('does not return or mutate another tenant’s product', async () => {
      const product = await approvedProduct('PROD-ISOLATED');
      const other = await seedTenant(prisma, 'Isolated Tenant');

      await expect(service.getProduct(other.companyId, product.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      await expect(
        service.createVariant(other.companyId, clerk, product.id, {
          code: 'STOWAWAY',
          name: 'Variant',
          attributes: { size: 'XL' },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      await expect(
        service.updateProduct(other.companyId, clerk, product.id, { name: 'Renamed' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      const untouched = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(untouched.name).toBe('Vaccine pack');

      // The other tenant sees an empty catalogue, not this tenant's data.
      const theirs = await service.listProducts(other.companyId);
      expect(theirs).toHaveLength(0);
    });
  });

  describe('audit', () => {
    it('records master-data audit events for the full product lifecycle', async () => {
      const product = await approvedProduct('PROD-AUDIT');
      const variant = await service.createVariant(companyId, clerk, product.id, {
        code: 'AUDIT-1',
        name: 'Variant',
        attributes: { size: 'L' },
      });
      await service.approveVariant(companyId, admin, variant.id, true);

      const events = await prisma.masterDataAuditEvent.findMany({
        where: { companyId },
        orderBy: { createdAt: 'asc' },
      });
      const types = events.map((e) => e.eventType);

      expect(types).toEqual(
        expect.arrayContaining(['PRODUCT_APPROVED', 'VARIANT_APPROVED', 'SKU_ALLOCATED']),
      );
      expect(events.every((e) => e.companyId === companyId)).toBe(true);
      expect(events.some((e) => e.actorId === admin.userId)).toBe(true);
    });
  });
});
