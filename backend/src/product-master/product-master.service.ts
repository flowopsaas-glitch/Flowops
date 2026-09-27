import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildSkuAllocation,
  canApproveProduct,
  canApproveVariant,
  checkRevision,
  computeAttributeFingerprint,
  computeProductFingerprint,
  isProductEditable,
  isVariantEditable,
  normalizeAliasForType,
  productMasterGate,
  validateAliasTarget,
  type AliasType,
} from './sku.policy';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

export interface ActorContext {
  userId?: string | null;
  name?: string | null;
  role?: string | null;
  permissions?: Record<string, boolean> | null;
}

/**
 * Product / Variant / SKU master data.
 *
 * Tenant scoping: every query is filtered by companyId. SKU allocation is
 * tenant-scoped and monotonic — the sequence row is locked inside a
 * transaction, so two concurrent onboardings cannot be handed the same number
 * and a number is never reused after a deletion.
 */
@Injectable()
export class ProductMasterService {
  private readonly logger = new Logger(ProductMasterService.name);

  constructor(private readonly prisma: PrismaService) {}

  isEnabled(): boolean {
    return productMasterGate().allowed;
  }

  private assertEnabled(): void {
    const gate = productMasterGate();
    if (!gate.allowed) throw new ForbiddenException(gate.reason);
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async createProduct(companyId: string, actor: ActorContext, dto: any) {
    this.assertEnabled();

    const existing = await this.prisma.product.findFirst({
      where: { companyId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`Product ${dto.code} already exists in this tenant`);
    }

    const fingerprint = computeProductFingerprint({
      name: dto.name,
      category: dto.category,
      brand: dto.brand,
      unitOfMeasure: dto.unitOfMeasure,
    });

    const duplicate = await this.prisma.product.findFirst({
      where: { companyId, attributeFingerprint: fingerprint, status: { not: 'RETIRED' as any } },
      select: { id: true, code: true, name: true },
    });

    const product = await this.prisma.product.create({
      data: {
        companyId,
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        category: dto.category ?? null,
        subCategory: dto.subCategory ?? null,
        brand: dto.brand ?? null,
        unitOfMeasure: dto.unitOfMeasure ?? 'EA',
        status: 'DRAFT',
        weightKg: dto.weightKg ?? null,
        volumeCbm: dto.volumeCbm ?? null,
        dimensions: dto.dimensions ?? null,
        isHazardous: dto.isHazardous ?? false,
        hazardousClass: dto.hazardousClass ?? null,
        requiresBatchTracking: dto.requiresBatchTracking ?? false,
        requiresSerialTracking: dto.requiresSerialTracking ?? false,
        attributeFingerprint: fingerprint,
      },
    });

    await this.audit(companyId, actor, {
      productId: product.id,
      eventType: 'PRODUCT_CREATED',
      description: `Product ${product.code} created`,
      afterState: { code: product.code, name: product.name },
      metadata: duplicate
        ? { possibleDuplicateOf: duplicate.code, matchedBy: 'attributeFingerprint' }
        : undefined,
    });

    return { ...product, possibleDuplicate: duplicate ?? null };
  }

  async listProducts(
    companyId: string,
    filters?: { status?: string; search?: string },
  ) {
    this.assertEnabled();
    const search = filters?.search?.trim();
    return this.prisma.product.findMany({
      where: {
        companyId,
        status: filters?.status as any,
        ...(search
          ? {
              OR: [
                { code: { contains: search, mode: 'insensitive' as const } },
                { name: { contains: search, mode: 'insensitive' as const } },
                { brand: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ status: 'asc' }, { code: 'asc' }],
      take: 300,
      include: {
        _count: { select: { variants: true } },
        variants: {
          select: { id: true, code: true, name: true, sku: true, status: true },
          orderBy: { code: 'asc' },
        },
      },
    });
  }

  async getProduct(companyId: string, productId: string) {
    this.assertEnabled();
    const product = await this.prisma.product.findFirst({
      where: { id: productId, companyId },
      include: {
        variants: { orderBy: { code: 'asc' } },
        aliases: true,
        auditEvents: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async updateProduct(companyId: string, actor: ActorContext, productId: string, dto: any) {
    this.assertEnabled();

    const product = await this.prisma.product.findFirst({
      where: { id: productId, companyId },
    });
    if (!product) throw new NotFoundException('Product not found');

    const revisionCheck = checkRevision(product.revision, dto.revision);
    if (!revisionCheck.ok) {
      await this.audit(companyId, actor, {
        productId,
        eventType: 'CONCURRENT_EDIT_REJECTED',
        description: revisionCheck.reason!,
      });
      throw new ConflictException(revisionCheck.reason);
    }

    if (!isProductEditable(product.status as any)) {
      throw new ConflictException(
        `Product is ${product.status} — approved master data changes through a new revision, not by overwriting the approved record`,
      );
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: {
        name: dto.name ?? undefined,
        description: dto.description ?? undefined,
        category: dto.category ?? undefined,
        subCategory: dto.subCategory ?? undefined,
        brand: dto.brand ?? undefined,
        unitOfMeasure: dto.unitOfMeasure ?? undefined,
        weightKg: dto.weightKg ?? undefined,
        volumeCbm: dto.volumeCbm ?? undefined,
        dimensions: dto.dimensions ?? undefined,
        isHazardous: dto.isHazardous ?? undefined,
        hazardousClass: dto.hazardousClass ?? undefined,
        requiresBatchTracking: dto.requiresBatchTracking ?? undefined,
        requiresSerialTracking: dto.requiresSerialTracking ?? undefined,
        revision: { increment: 1 },
      },
    });

    await this.audit(companyId, actor, {
      productId,
      eventType: 'PRODUCT_UPDATED',
      description: `Product ${product.code} updated (revision ${product.revision} → ${updated.revision})`,
      beforeState: snapshotProduct(product),
      afterState: snapshotProduct(updated),
    });

    return updated;
  }

  async submitProduct(companyId: string, actor: ActorContext, productId: string) {
    this.assertEnabled();
    const product = await this.requireProduct(companyId, productId);
    if (product.status !== 'DRAFT' && product.status !== 'REJECTED') {
      throw new ConflictException(`Product is ${product.status} and cannot be submitted`);
    }
    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { status: 'PENDING_APPROVAL' },
    });
    await this.audit(companyId, actor, {
      productId,
      eventType: 'PRODUCT_SUBMITTED',
      description: `Product ${product.code} submitted for approval`,
      beforeState: { status: product.status },
      afterState: { status: updated.status },
    });
    return updated;
  }

  async approveProduct(
    companyId: string,
    actor: ActorContext,
    productId: string,
    approve: boolean,
    note?: string,
  ) {
    this.assertEnabled();
    const product = await this.requireProduct(companyId, productId);

    if (approve && !canApproveProduct(product.status as any)) {
      throw new ConflictException(`Product is ${product.status} and cannot be approved`);
    }
    if (approve && !canApproveMasterData(actor)) {
      await this.audit(companyId, actor, {
        productId,
        eventType: 'ACCESS_DENIED',
        description: 'Product approval attempted without an approval role',
      });
      throw new ForbiddenException('Approving master data requires a manager or admin role');
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        approvedById: approve ? (actor.userId ?? 'SYSTEM') : null,
        approvedByName: approve ? (actor.name ?? null) : null,
        approvedAt: approve ? new Date() : null,
      },
    });

    await this.audit(companyId, actor, {
      productId,
      eventType: approve ? 'PRODUCT_APPROVED' : 'PRODUCT_REJECTED',
      description: `Product ${product.code} ${approve ? 'approved' : 'rejected'}${note ? `: ${note}` : ''}`,
      beforeState: { status: product.status },
      afterState: { status: updated.status },
    });

    return updated;
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async createVariant(companyId: string, actor: ActorContext, productId: string, dto: any) {
    this.assertEnabled();

    const product = await this.requireProduct(companyId, productId);

    const attributes = (dto.attributes ?? {}) as Record<string, unknown>;
    if (Object.keys(attributes).length === 0) {
      throw new BadRequestException('A variant needs at least one defining attribute');
    }

    const fingerprint = computeAttributeFingerprint(attributes);

    const existingFingerprint = await this.prisma.productVariant.findFirst({
      where: { companyId, attributeFingerprint: fingerprint },
      select: { id: true, code: true, sku: true, productId: true },
    });
    if (existingFingerprint) {
      await this.audit(companyId, actor, {
        productId,
        variantId: existingFingerprint.id,
        eventType: 'DUPLICATE_FINGERPRINT_BLOCKED',
        description: `Variant creation blocked: attributes match existing variant ${existingFingerprint.code}`,
        metadata: { attributes },
      });
      throw new ConflictException(
        `These attributes already exist as variant ${existingFingerprint.code} — master data is deduplicated on normalised attributes`,
      );
    }

    const codeConflict = await this.prisma.productVariant.findFirst({
      where: { companyId, code: dto.code },
    });
    if (codeConflict) {
      throw new ConflictException(`Variant code ${dto.code} already exists in this tenant`);
    }

    const variant = await this.prisma.productVariant.create({
      data: {
        companyId,
        productId,
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        attributes: attributes as any,
        attributeFingerprint: fingerprint,
        status: 'DRAFT',
        weightKg: dto.weightKg ?? null,
        volumeCbm: dto.volumeCbm ?? null,
        dimensions: dto.dimensions ?? null,
        reorderPoint: dto.reorderPoint ?? null,
        reorderQuantity: dto.reorderQuantity ?? null,
      },
    });

    await this.audit(companyId, actor, {
      productId,
      variantId: variant.id,
      eventType: 'VARIANT_CREATED',
      description: `Variant ${variant.code} created for product ${product.code}`,
      afterState: { code: variant.code, attributes },
    });

    return variant;
  }

  async listVariants(companyId: string, filters?: { status?: string; productId?: string }) {
    this.assertEnabled();
    return this.prisma.productVariant.findMany({
      where: {
        companyId,
        status: filters?.status as any,
        productId: filters?.productId,
      },
      orderBy: { code: 'asc' },
      take: 500,
      include: { product: { select: { code: true, name: true, status: true } } },
    });
  }

  async updateVariant(companyId: string, actor: ActorContext, variantId: string, dto: any) {
    this.assertEnabled();

    const variant = await this.requireVariant(companyId, variantId);

    const revisionCheck = checkRevision(variant.revision, dto.revision);
    if (!revisionCheck.ok) {
      await this.audit(companyId, actor, {
        variantId,
        eventType: 'CONCURRENT_EDIT_REJECTED',
        description: revisionCheck.reason!,
      });
      throw new ConflictException(revisionCheck.reason);
    }

    if (!isVariantEditable(variant.status as any)) {
      throw new ConflictException(`Variant is ${variant.status} and cannot be edited`);
    }

    let fingerprint = variant.attributeFingerprint;
    if (dto.attributes) {
      fingerprint = computeAttributeFingerprint(dto.attributes);
      const clash = await this.prisma.productVariant.findFirst({
        where: { companyId, attributeFingerprint: fingerprint, id: { not: variantId } },
        select: { code: true },
      });
      if (clash) {
        throw new ConflictException(
          `Changing these attributes would collide with variant ${clash.code}`,
        );
      }
    }

    const updated = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        name: dto.name ?? undefined,
        description: dto.description ?? undefined,
        attributes: dto.attributes ?? undefined,
        attributeFingerprint: fingerprint,
        weightKg: dto.weightKg ?? undefined,
        volumeCbm: dto.volumeCbm ?? undefined,
        dimensions: dto.dimensions ?? undefined,
        reorderPoint: dto.reorderPoint ?? undefined,
        reorderQuantity: dto.reorderQuantity ?? undefined,
        revision: { increment: 1 },
      },
    });

    await this.audit(companyId, actor, {
      variantId,
      productId: variant.productId,
      eventType: 'VARIANT_UPDATED',
      description: `Variant ${variant.code} updated (revision ${variant.revision} → ${updated.revision})`,
      beforeState: { attributes: variant.attributes as any, revision: variant.revision },
      afterState: { attributes: updated.attributes as any, revision: updated.revision },
    });

    return updated;
  }

  async approveVariant(
    companyId: string,
    actor: ActorContext,
    variantId: string,
    approve: boolean,
    note?: string,
  ) {
    this.assertEnabled();

    const variant = await this.requireVariant(companyId, variantId);
    const product = await this.requireProduct(companyId, variant.productId);

    if (approve) {
      const parentCheck = canApproveVariant(product.status as any);
      if (!parentCheck.ok) {
        await this.audit(companyId, actor, {
          variantId,
          productId: product.id,
          eventType: 'ACCESS_DENIED',
          description: `Variant approval blocked: ${parentCheck.reason}`,
        });
        throw new ConflictException(parentCheck.reason);
      }
      if (variant.status === 'APPROVED') return variant;
      if (!canApproveMasterData(actor)) {
        throw new ForbiddenException('Approving master data requires a manager or admin role');
      }
      // The SKU is allocated at approval time, not at creation: an unapproved
      // variant must not consume a number that can never be released.
      if (!variant.sku) {
        await this.allocateSku(companyId, actor, variantId);
      }
    }

    const updated = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        approvedById: approve ? (actor.userId ?? 'SYSTEM') : null,
        approvedByName: approve ? (actor.name ?? null) : null,
        approvedAt: approve ? new Date() : null,
      },
    });

    await this.audit(companyId, actor, {
      variantId,
      productId: product.id,
      eventType: approve ? 'VARIANT_APPROVED' : 'VARIANT_REJECTED',
      description: `Variant ${variant.code} ${approve ? 'approved' : 'rejected'}${
        approve && updated.sku ? ` — SKU ${updated.sku}` : ''
      }${note ? `: ${note}` : ''}`,
      beforeState: { status: variant.status, sku: variant.sku },
      afterState: { status: updated.status, sku: updated.sku },
    });

    return updated;
  }

  // ── SKU allocation ────────────────────────────────────────────────────────

  /**
   * Allocate the next SKU for this tenant.
   *
   * Concurrency: the sequence row is created if missing and then locked with
   * `SELECT … FOR UPDATE` inside a transaction, so parallel allocations
   * serialise and each caller gets a distinct number. The counter only ever
   * moves forward — a deleted variant does not return its SKU to the pool.
   *
   * The bootstrap insert below is deliberately `ON CONFLICT DO NOTHING` with
   * **no conflict target**. `sku_sequences` has two unique arbiters — the
   * primary key on `id` and the unique index on `companyId` — and naming only
   * `("companyId")` leaves the primary key uncovered: a caller that loses the
   * creation race can then be reported as a `sku_sequences_pkey` violation
   * (SQLSTATE 23505) instead of falling through to the lock and reading the
   * row the winner created. Untargeted `DO NOTHING` covers both arbiters, so
   * the first allocation for a tenant is idempotent however many callers race
   * for it. Reproduced and fixed against PostgreSQL 16 (see the integration
   * suite's bootstrap-race case).
   */
  async allocateSku(companyId: string, actor: ActorContext, variantId: string) {
    this.assertEnabled();

    const variant = await this.requireVariant(companyId, variantId);
    if (variant.sku) return { sku: variant.sku, allocated: false, variantId };

    const allocated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO sku_sequences (id, "companyId", "nextNumber", prefix, format, "updatedAt")
        VALUES (${`seq_${companyId}`}, ${companyId}, 1, 'SKU', 'SKU-{number:05d}', NOW())
        ON CONFLICT DO NOTHING
      `;

      const rows = await tx.$queryRaw<
        Array<{ nextNumber: number; prefix: string | null; format: string | null }>
      >`SELECT "nextNumber", prefix, format FROM sku_sequences WHERE "companyId" = ${companyId} FOR UPDATE`;

      const sequence = rows[0];
      if (!sequence) throw new ConflictException('SKU sequence unavailable — retry');

      // We now hold the tenant's allocation lock, so any concurrent allocation
      // has committed or is waiting. Re-read the variant here — inside the lock
      // — so approving the same variant twice in parallel returns the SKU the
      // first call allocated instead of burning a second number.
      const current = await tx.productVariant.findUnique({
        where: { id: variantId },
        select: { sku: true },
      });
      if (current?.sku) {
        return { sku: current.sku, number: null, alreadyAllocated: true as const };
      }

      const allocation = buildSkuAllocation({
        nextNumber: Number(sequence.nextNumber),
        prefix: sequence.prefix,
        format: sequence.format,
      });

      await tx.$executeRaw`
        UPDATE sku_sequences SET "nextNumber" = ${allocation.nextNumber}, "updatedAt" = NOW()
        WHERE "companyId" = ${companyId}
      `;

      const updated = await tx.productVariant.update({
        where: { id: variantId },
        data: { sku: allocation.sku, skuAllocatedAt: new Date() },
      });

      return {
        sku: allocation.sku,
        number: allocation.number,
        alreadyAllocated: false as const,
        variant: updated,
      };
    });

    if (allocated.alreadyAllocated) {
      return { sku: allocated.sku, allocated: false, variantId };
    }

    await this.audit(companyId, actor, {
      variantId,
      productId: variant.productId,
      eventType: 'SKU_ALLOCATED',
      description: `SKU ${allocated.sku} allocated to variant ${variant.code}`,
      afterState: { sku: allocated.sku },
    });

    return { sku: allocated.sku, allocated: true, variantId };
  }

  // ── Aliases ───────────────────────────────────────────────────────────────

  async addAlias(companyId: string, actor: ActorContext, dto: any) {
    this.assertEnabled();

    const targetCheck = validateAliasTarget({ productId: dto.productId, variantId: dto.variantId });
    if (!targetCheck.ok) throw new BadRequestException(targetCheck.reason);

    if (dto.productId) await this.requireProduct(companyId, dto.productId);
    if (dto.variantId) await this.requireVariant(companyId, dto.variantId);

    const type = dto.type as AliasType;
    const value = normalizeAliasForType(type, dto.value);

    const clash = await this.prisma.productAlias.findFirst({
      where: {
        companyId,
        type,
        value,
        supplierRef: dto.supplierRef ?? null,
        customerRef: dto.customerRef ?? null,
      },
      select: { id: true, productId: true, variantId: true },
    });
    if (clash) {
      throw new ConflictException(`Alias ${type}:${value} is already in use in this tenant`);
    }

    const alias = await this.prisma.productAlias.create({
      data: {
        companyId,
        productId: dto.productId ?? null,
        variantId: dto.variantId ?? null,
        type,
        value,
        supplierRef: dto.supplierRef ?? null,
        customerRef: dto.customerRef ?? null,
      },
    });

    await this.audit(companyId, actor, {
      productId: dto.productId ?? null,
      variantId: dto.variantId ?? null,
      eventType: 'ALIAS_ADDED',
      description: `Alias ${alias.type} added`,
      afterState: { type: alias.type, value: alias.value },
    });

    return alias;
  }

  async removeAlias(companyId: string, actor: ActorContext, aliasId: string) {
    this.assertEnabled();
    const alias = await this.prisma.productAlias.findFirst({ where: { id: aliasId, companyId } });
    if (!alias) throw new NotFoundException('Alias not found');

    await this.prisma.productAlias.update({ where: { id: aliasId }, data: { isActive: false } });

    await this.audit(companyId, actor, {
      productId: alias.productId,
      variantId: alias.variantId,
      eventType: 'ALIAS_REMOVED',
      description: `Alias ${alias.type} deactivated`,
      beforeState: { isActive: true },
      afterState: { isActive: false },
    });

    return { ok: true };
  }

  /**
   * Resolve a scanned code (barcode / supplier code) to governed master data.
   * Returns null rather than guessing — an unknown code becomes an exception in
   * the receiving process, not a silent stock movement.
   */
  async resolveAlias(companyId: string, type: string, value: string) {
    this.assertEnabled();
    const normalized = normalizeAliasForType(type as AliasType, value);
    const alias = await this.prisma.productAlias.findFirst({
      where: { companyId, type, value: normalized, isActive: true },
      include: {
        variant: { select: { id: true, code: true, name: true, sku: true, status: true } },
        product: { select: { id: true, code: true, name: true, status: true } },
      },
    });
    if (alias) return { matched: true, alias };
    return { matched: false, alias: null };
  }

  // ── Audit ─────────────────────────────────────────────────────────────────

  async listAuditEvents(
    companyId: string,
    filters?: { productId?: string; variantId?: string },
  ) {
    this.assertEnabled();
    return this.prisma.masterDataAuditEvent.findMany({
      where: {
        companyId,
        productId: filters?.productId,
        variantId: filters?.variantId,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async requireProduct(companyId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, companyId } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  private async requireVariant(companyId: string, variantId: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, companyId },
    });
    if (!variant) throw new NotFoundException('Variant not found');
    return variant;
  }

  private async audit(
    companyId: string,
    actor: ActorContext,
    event: {
      eventType: string;
      description: string;
      productId?: string | null;
      variantId?: string | null;
      beforeState?: Record<string, unknown>;
      afterState?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    },
  ) {
    try {
      await this.prisma.masterDataAuditEvent.create({
        data: {
          companyId,
          productId: event.productId ?? null,
          variantId: event.variantId ?? null,
          eventType: event.eventType,
          actorId: actor.userId ?? 'SYSTEM',
          actorName: actor.name ?? null,
          beforeState: event.beforeState as any,
          afterState: event.afterState as any,
          description: event.description,
          metadata: event.metadata as any,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to write MasterDataAuditEvent (${event.eventType}) for company ${companyId}: ${
          (err as Error)?.message
        }`,
      );
    }
  }
}

function canApproveMasterData(actor: ActorContext): boolean {
  const role = (actor.role ?? '').toUpperCase();
  if (['ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'OWNER'].includes(role)) return true;
  return actor.permissions?.['master_data:approve'] === true;
}

function snapshotProduct(product: any) {
  return {
    code: product.code,
    name: product.name,
    category: product.category,
    brand: product.brand,
    unitOfMeasure: product.unitOfMeasure,
    status: product.status,
    revision: product.revision,
  };
}
