import { Injectable, Logger, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { GROQ_MODEL } from '../ai/groq-model';
import { GoodsReceiptProcessBridge } from './goods-receipt-process.bridge';
import { withCompanyId } from '../common/security/tenant.util';

@Injectable()
export class WarehouseManagementService {
  private readonly logger = new Logger(WarehouseManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    // Optional so the WMS keeps working in any context that constructs this
    // service without the Process Control bridge (and because the bridge is
    // inert unless its feature flags are set).
    @Optional() private readonly receiptBridge?: GoodsReceiptProcessBridge,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  // WAREHOUSE CRUD
  // ═══════════════════════════════════════════════════════════════════════

  async listWarehouses(companyId: string) {
    return this.prisma.warehouse.findMany({
      where: { companyId, isActive: true },
      include: { zones: { include: { _count: { select: { binLocations: true } } } } },
      orderBy: { name: 'asc' },
    });
  }

  async createWarehouse(companyId: string, dto: any) {
    return this.prisma.warehouse.create({
      // withCompanyId strips a client-supplied companyId: the spread used to
      // come second, so a body could create a warehouse in another tenant.
      data: withCompanyId(companyId, dto),
    });
  }

  async getWarehouse(id: string, companyId: string) {
    const wh = await this.prisma.warehouse.findFirst({
      where: { id, companyId },
      include: {
        zones: { include: { binLocations: true }, orderBy: { sortOrder: 'asc' } },
        dockSlots: true,
      },
    });
    if (!wh) throw new NotFoundException('Warehouse not found');
    return wh;
  }


  // ═══════════════════════════════════════════════════════════════════════
  // ZONE & BIN MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  async createZone(warehouseId: string, companyId: string, dto: any) {
    const wh = await this.getWarehouse(warehouseId, companyId);
    return this.prisma.warehouseZone.create({
      data: { warehouseId: wh.id, ...dto },
    });
  }

  /** Load a zone only if it belongs to the caller's company (via warehouse). */
  private async getOwnedZone(zoneId: string, companyId: string) {
    const zone = await this.prisma.warehouseZone.findFirst({
      where: { id: zoneId, warehouse: { companyId } },
    });
    if (!zone) throw new NotFoundException('Zone not found');
    return zone;
  }

  async createBin(zoneId: string, companyId: string, dto: any) {
    await this.getOwnedZone(zoneId, companyId); // tenant-scope guard
    return this.prisma.binLocation.create({
      data: { zoneId, ...dto },
    });
  }

  async bulkCreateBins(zoneId: string, companyId: string, dto: {
    aisle: string; rack: string; levels: number; positions: number;
    binType?: string; maxWeightKg?: number;
  }) {
    const bins: any[] = [];
    const zone = await this.getOwnedZone(zoneId, companyId); // tenant-scope guard

    for (let level = 1; level <= dto.levels; level++) {
      for (let pos = 1; pos <= dto.positions; pos++) {
        const code = `${dto.aisle}-${dto.rack}-${String(level).padStart(2, '0')}-${String(pos).padStart(3, '0')}`;
        bins.push({
          zoneId,
          code,
          aisle: dto.aisle,
          rack: dto.rack,
          level: String(level).padStart(2, '0'),
          position: String(pos).padStart(3, '0'),
          binType: dto.binType || 'SHELF',
          maxWeightKg: dto.maxWeightKg,
        });
      }
    }

    await this.prisma.binLocation.createMany({ data: bins, skipDuplicates: true });

    // Update warehouse total
    const totalBins = await this.prisma.binLocation.count({
      where: { zone: { warehouse: { id: zone.warehouseId } } },
    });
    await this.prisma.warehouse.update({
      where: { id: zone.warehouseId },
      data: { totalBinLocations: totalBins },
    });

    return { created: bins.length, totalBins };
  }


  // ═══════════════════════════════════════════════════════════════════════
  // INVENTORY MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  async getInventory(companyId: string, filters?: {
    sku?: string; binCode?: string; status?: string; warehouseId?: string;
  }) {
    const where: any = { companyId };
    if (filters?.sku) where.sku = { contains: filters.sku, mode: 'insensitive' };
    if (filters?.status) where.status = filters.status;

    return this.prisma.inventoryItem.findMany({
      where,
      include: { bin: { include: { zone: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  async getInventorySummary(companyId: string) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { companyId },
      select: { sku: true, quantityOnHand: true, quantityAllocated: true,
        quantityAvailable: true, unitCost: true, status: true, expiryDate: true },
    });

    const totalSKUs = new Set(items.map(i => i.sku)).size;
    const totalUnits = items.reduce((s, i) => s + i.quantityOnHand, 0);
    const totalValue = items.reduce((s, i) => s + (i.quantityOnHand * (i.unitCost || 0)), 0);
    const allocated = items.reduce((s, i) => s + i.quantityAllocated, 0);

    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 86400000);
    const expiringSoon = items.filter(i => i.expiryDate && new Date(i.expiryDate) <= in30).length;
    const damaged = items.filter(i => i.status === 'DAMAGED').length;

    return {
      totalSKUs, totalUnits, totalValue: Math.round(totalValue),
      allocated, available: totalUnits - allocated,
      expiringSoon, damaged,
      currency: 'ZAR',
    };
  }

  async adjustStock(companyId: string, dto: {
    binId: string; sku: string; quantity: number; reason: string; performedBy?: string;
  }) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { companyId, binId: dto.binId, sku: dto.sku },
    });
    if (!item) throw new NotFoundException(`SKU ${dto.sku} not found in bin`);

    const newQty = item.quantityOnHand + dto.quantity;
    if (newQty < 0) throw new BadRequestException('Cannot reduce below zero');

    await this.prisma.inventoryItem.update({
      where: { id: item.id },
      data: {
        quantityOnHand: newQty,
        quantityAvailable: newQty - item.quantityAllocated,
        lastMovedAt: new Date(),
      },
    });

    await this.recordMovement(companyId, {
      type: 'ADJUSTMENT', sku: dto.sku, quantity: dto.quantity,
      fromBinId: dto.quantity < 0 ? dto.binId : undefined,
      toBinId: dto.quantity > 0 ? dto.binId : undefined,
      reason: dto.reason, performedBy: dto.performedBy,
    });

    return { sku: dto.sku, newQuantity: newQty, adjustment: dto.quantity };
  }


  // ═══════════════════════════════════════════════════════════════════════
  // GOODS RECEIPT (Inbound Receiving)
  // ═══════════════════════════════════════════════════════════════════════

  async createGoodsReceipt(companyId: string, warehouseId: string, dto: any) {
    const count = await this.prisma.goodsReceipt.count({ where: { companyId } });
    const receiptNumber = `GR-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    const receipt = await this.prisma.goodsReceipt.create({
      data: {
        companyId, warehouseId, receiptNumber,
        poNumber: dto.poNumber, supplierName: dto.supplierName,
        carrierName: dto.carrierName, expectedDate: dto.expectedDate,
        expectedLines: dto.lines?.length || 0,
        expectedQty: dto.lines?.reduce((s: number, l: any) => s + (l.expectedQty || 0), 0) || 0,
        lines: dto.lines ? { create: dto.lines } : undefined,
      },
      include: { lines: true },
    });

    // Process Control bridge — off unless PROCESS_CONTROL_ENABLED and
    // PROCESS_CONTROL_WMS_RECEIPT_ENABLED are both true. Starting the standard
    // must never be able to fail a goods receipt, so it is fire-and-logged.
    if (this.receiptBridge?.isEnabled()) {
      await this.receiptBridge.onReceiptCreated(
        companyId,
        receipt,
        actorFrom(dto),
      );
    }

    return receipt;
  }

  async receiveGoods(id: string, companyId: string, dto: {
    lines: { sku: string; receivedQty: number; damagedQty?: number;
      batchNumber?: string; expiryDate?: string; putAwayBinId?: string }[];
    receivedBy?: string;
  }) {
    const gr = await this.prisma.goodsReceipt.findFirst({
      where: { id, companyId }, include: { lines: true },
    });
    if (!gr) throw new NotFoundException('Goods receipt not found');

    // Resolve the received SKUs against governed master data up front: the
    // put-away below links stock to the variant it actually belongs to, and the
    // Process Control bridge needs to tell an unknown code from a known one.
    const variantsBySku = new Map<string, string>();
    if (dto.lines.length > 0) {
      const variants = await this.prisma.productVariant.findMany({
        where: { companyId, sku: { in: dto.lines.map((l) => l.sku) } },
        select: { id: true, sku: true },
      });
      for (const variant of variants) {
        if (variant.sku) variantsBySku.set(variant.sku, variant.id);
      }
    }

    // Whether this tenant governs SKUs at all decides if an unresolved code is
    // an exception: a receipt of codes the tenant has never onboarded must not
    // slip through simply because *none* of them matched.
    const governsSkus =
      variantsBySku.size > 0 ||
      (await this.prisma.productVariant.count({ where: { companyId, sku: { not: null } } })) > 0;

    let totalReceived = 0, totalDamaged = 0;

    for (const line of dto.lines) {
      totalReceived += line.receivedQty;
      totalDamaged += line.damagedQty || 0;

      // Update GR line
      const grLine = gr.lines.find(l => l.sku === line.sku);
      if (grLine) {
        await this.prisma.goodsReceiptLine.update({
          where: { id: grLine.id },
          data: {
            receivedQty: line.receivedQty,
            damagedQty: line.damagedQty || 0,
            putAwayBinId: line.putAwayBinId,
            putAwayComplete: !!line.putAwayBinId,
            batchNumber: line.batchNumber,
            expiryDate: line.expiryDate ? new Date(line.expiryDate) : undefined,
          },
        });
      }

      // Create/update inventory if bin assigned
      if (line.putAwayBinId && line.receivedQty > 0) {
        await this.putAwayStock(companyId, {
          binId: line.putAwayBinId, sku: line.sku, quantity: line.receivedQty,
          batchNumber: line.batchNumber,
          expiryDate: line.expiryDate ? new Date(line.expiryDate) : undefined,
          goodsReceiptId: id, performedBy: dto.receivedBy,
          // Null for a SKU that master data does not govern — the receipt is
          // then carried by the process as a controlled exception, not silently
          // booked against a variant that does not exist.
          productVariantId: variantsBySku.get(line.sku),
        });
      }
    }

    // Process Control bridge: reconcile the receipt against the standard and
    // raise the exceptions it finds. While the bridge is enforcing, a receipt
    // with blocking exceptions is refused here — before the WMS calls it done.
    let bridgeResult: any = null;
    if (this.receiptBridge?.isEnabled()) {
      // Unknown codes (no governed variant) become reconcile exceptions instead
      // of being booked silently. Resolved above, before any stock moved.
      const knownSkus = new Set(variantsBySku.keys());

      bridgeResult = await this.receiptBridge.onGoodsReceived(
        companyId,
        { id, receiptNumber: gr.receiptNumber, expectedQty: gr.expectedQty, receivedQty: totalReceived },
        dto.lines.map((line: any) => {
          const grLine = gr.lines.find((l) => l.sku === line.sku);
          return {
            sku: line.sku,
            expectedQty: grLine?.expectedQty ?? null,
            receivedQty: line.receivedQty,
            damagedQty: line.damagedQty ?? 0,
            putAwayBinId: line.putAwayBinId ?? null,
            // Only asserted when the tenant actually governs SKUs in master
            // data; a tenant without master data must not be blocked by it.
            knownVariant: governsSkus ? knownSkus.has(line.sku) : undefined,
          };
        }),
        actorFrom(dto),
      );
      this.receiptBridge.assertCompletionAllowed(bridgeResult.blockDecision);
    }

    await this.prisma.goodsReceipt.update({
      where: { id },
      data: {
        status: 'COMPLETED', arrivedAt: gr.arrivedAt || new Date(),
        completedAt: new Date(), receivedLines: dto.lines.length,
        receivedQty: totalReceived, damagedQty: totalDamaged,
        receivedBy: dto.receivedBy, completedBy: dto.receivedBy,
      },
    });

    return {
      receiptNumber: gr.receiptNumber,
      received: totalReceived,
      damaged: totalDamaged,
      processControl: bridgeResult
        ? {
            instanceId: bridgeResult.instanceId,
            outcome: bridgeResult.reconciliation?.outcome,
            incidents: bridgeResult.reconciliation?.incidents?.map((i: any) => i.code) ?? [],
          }
        : undefined,
    };
  }

  private async putAwayStock(companyId: string, dto: {
    binId: string; sku: string; quantity: number; batchNumber?: string;
    expiryDate?: Date; goodsReceiptId?: string; performedBy?: string;
    productVariantId?: string;
  }) {
    // Find or create inventory item at this bin
    const item = await this.prisma.inventoryItem.findFirst({
      where: { companyId, binId: dto.binId, sku: dto.sku, batchNumber: dto.batchNumber || null },
    });

    if (item) {
      await this.prisma.inventoryItem.update({
        where: { id: item.id },
        data: {
          quantityOnHand: { increment: dto.quantity },
          quantityAvailable: { increment: dto.quantity },
          lastMovedAt: new Date(),
          // Link stock to governed master data once it is known, but never
          // re-point an item that already resolves to a variant.
          ...(dto.productVariantId && !item.productVariantId
            ? { productVariantId: dto.productVariantId }
            : {}),
        },
      });
    } else {
      await this.prisma.inventoryItem.create({
        data: {
          companyId, binId: dto.binId, sku: dto.sku,
          description: dto.sku, // Will be enriched later
          quantityOnHand: dto.quantity, quantityAvailable: dto.quantity,
          batchNumber: dto.batchNumber, expiryDate: dto.expiryDate,
          status: 'AVAILABLE', lastMovedAt: new Date(),
          productVariantId: dto.productVariantId ?? null,
        },
      });
    }

    // Update bin state
    await this.prisma.binLocation.update({
      where: { id: dto.binId },
      data: { isEmpty: false },
    });

    // Record movement
    await this.recordMovement(companyId, {
      type: 'PUT_AWAY', sku: dto.sku, quantity: dto.quantity,
      toBinId: dto.binId, goodsReceiptId: dto.goodsReceiptId,
      performedBy: dto.performedBy,
    });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // PICK & PACK (Outbound Fulfilment)
  // ═══════════════════════════════════════════════════════════════════════

  async createPickOrder(companyId: string, warehouseId: string, dto: any) {
    const count = await this.prisma.pickOrder.count({ where: { companyId } });
    const orderNumber = `PO-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    // AI-assisted: find optimal bins for each SKU (FEFO + closest to dispatch)
    const linesWithBins = await Promise.all(
      (dto.lines || []).map(async (line: any) => {
        const suggestedBin = await this.aiSuggestPickBin(companyId, line.sku, line.requestedQty);
        return { ...line, suggestedBinId: suggestedBin?.id || null };
      })
    );

    return this.prisma.pickOrder.create({
      data: {
        companyId, warehouseId, orderNumber,
        sourceType: dto.sourceType, sourceId: dto.sourceId,
        clientName: dto.clientName, priority: dto.priority || 0,
        shipToName: dto.shipToName, shipToAddress: dto.shipToAddress,
        totalLines: linesWithBins.length,
        totalQty: linesWithBins.reduce((s: number, l: any) => s + l.requestedQty, 0),
        lines: { create: linesWithBins },
      },
      include: { lines: true },
    });
  }

  async assignPicker(pickOrderId: string, companyId: string, userId: string) {
    // Tenant-scoped: only assign a pick order within the caller's company.
    const res = await this.prisma.pickOrder.updateMany({
      where: { id: pickOrderId, companyId },
      data: { assignedTo: userId, assignedAt: new Date(), status: 'ASSIGNED' },
    });
    if (res.count === 0) throw new NotFoundException('Pick order not found');
    return this.prisma.pickOrder.findFirst({ where: { id: pickOrderId, companyId } });
  }

  async confirmPick(pickOrderId: string, companyId: string, dto: {
    lines: { sku: string; pickedQty: number; actualBinId: string; pickedBy?: string }[];
  }) {
    const order = await this.prisma.pickOrder.findFirst({
      where: { id: pickOrderId, companyId }, include: { lines: true },
    });
    if (!order) throw new NotFoundException('Pick order not found');

    let totalPicked = 0;
    for (const pick of dto.lines) {
      const line = order.lines.find(l => l.sku === pick.sku);
      if (!line) continue;

      await this.prisma.pickOrderLine.update({
        where: { id: line.id },
        data: {
          pickedQty: pick.pickedQty, actualBinId: pick.actualBinId,
          picked: true, pickedAt: new Date(), pickedBy: pick.pickedBy,
        },
      });

      // Deduct from inventory
      const item = await this.prisma.inventoryItem.findFirst({
        where: { companyId, binId: pick.actualBinId, sku: pick.sku },
      });
      if (item) {
        const newQty = Math.max(0, item.quantityOnHand - pick.pickedQty);
        await this.prisma.inventoryItem.update({
          where: { id: item.id },
          data: {
            quantityOnHand: newQty,
            quantityAllocated: Math.max(0, item.quantityAllocated - pick.pickedQty),
            quantityAvailable: newQty - Math.max(0, item.quantityAllocated - pick.pickedQty),
            lastMovedAt: new Date(),
          },
        });
        if (newQty === 0) {
          await this.prisma.binLocation.update({
            where: { id: pick.actualBinId }, data: { isEmpty: true },
          });
        }
      }

      await this.recordMovement(companyId, {
        type: 'PICK', sku: pick.sku, quantity: -pick.pickedQty,
        fromBinId: pick.actualBinId, pickOrderId,
        performedBy: pick.pickedBy,
      });

      totalPicked += pick.pickedQty;
    }

    const allPicked = dto.lines.every(l => {
      const line = order.lines.find(ol => ol.sku === l.sku);
      return line && l.pickedQty >= line.requestedQty;
    });

    await this.prisma.pickOrder.update({
      where: { id: pickOrderId },
      data: {
        pickedLines: dto.lines.filter(l => l.pickedQty > 0).length,
        pickedQty: totalPicked,
        status: allPicked ? 'PICKED' : 'IN_PROGRESS',
        completedAt: allPicked ? new Date() : undefined,
      },
    });

    return { orderNumber: order.orderNumber, totalPicked, status: allPicked ? 'PICKED' : 'IN_PROGRESS' };
  }


  // ═══════════════════════════════════════════════════════════════════════
  // CYCLE COUNT
  // ═══════════════════════════════════════════════════════════════════════

  async createCycleCount(companyId: string, warehouseId: string, dto: any) {
    const count = await this.prisma.cycleCount.count({ where: { companyId } });
    const countNumber = `CC-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    // Build count lines from inventory in scope
    const where: any = { companyId };
    if (dto.zoneFilter) {
      where.bin = { zone: { code: dto.zoneFilter } };
    }
    if (dto.skuFilter) {
      where.sku = { contains: dto.skuFilter, mode: 'insensitive' };
    }

    const items = await this.prisma.inventoryItem.findMany({
      where, include: { bin: true }, take: 500,
    });

    const lines = items.map(item => ({
      binCode: item.bin.code,
      sku: item.sku,
      description: item.description,
      systemQty: item.quantityOnHand,
    }));

    return this.prisma.cycleCount.create({
      data: {
        companyId, warehouseId, countNumber,
        countType: dto.countType || 'FULL',
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : new Date(),
        zoneFilter: dto.zoneFilter, skuFilter: dto.skuFilter,
        totalBins: new Set(lines.map(l => l.binCode)).size,
        lines: { create: lines },
      },
      include: { lines: true },
    });
  }

  async submitCycleCount(id: string, companyId: string, dto: {
    lines: { binCode: string; sku: string; countedQty: number }[];
    completedBy?: string;
  }) {
    const cc = await this.prisma.cycleCount.findFirst({
      where: { id, companyId }, include: { lines: true },
    });
    if (!cc) throw new NotFoundException('Cycle count not found');

    let totalVariances = 0;
    let varianceValue = 0;
    const countedBins: Set<string> = new Set<string>();

    for (const count of dto.lines) {
      const line = cc.lines.find(l => l.binCode === count.binCode && l.sku === count.sku);
      if (!line) continue;

      const variance = count.countedQty - line.systemQty;
      countedBins.add(count.binCode);

      await this.prisma.cycleCountLine.update({
        where: { id: line.id },
        data: { countedQty: count.countedQty, variance },
      });

      if (variance !== 0) {
        totalVariances++;
        // Estimate value of variance
        const item = await this.prisma.inventoryItem.findFirst({
          where: { companyId, sku: count.sku },
          select: { unitCost: true },
        });
        varianceValue += Math.abs(variance) * (item?.unitCost || 0);
      }
    }

    const accuracyRate = dto.lines.length > 0
      ? Math.round(((dto.lines.length - totalVariances) / dto.lines.length) * 1000) / 10
      : 100;

    await this.prisma.cycleCount.update({
      where: { id },
      data: {
        status: 'COMPLETED', completedAt: new Date(),
        countedBins: countedBins.size, totalVariances,
        varianceValue: Math.round(varianceValue),
        accuracyRate,
      },
    });

    return {
      countNumber: cc.countNumber, countedBins: countedBins.size,
      totalVariances, varianceValue: Math.round(varianceValue),
      accuracyRate,
    };
  }

  async approveCycleCount(id: string, companyId: string, approvedBy: string) {
    const cc = await this.prisma.cycleCount.findFirst({
      where: { id, companyId, status: 'COMPLETED' }, include: { lines: true },
    });
    if (!cc) throw new NotFoundException('Cycle count not found or not completed');

    // Post adjustments for all variances
    for (const line of cc.lines) {
      if (line.variance && line.variance !== 0 && line.countedQty !== null) {
        const item = await this.prisma.inventoryItem.findFirst({
          where: { companyId, sku: line.sku, bin: { code: line.binCode } },
        });
        if (item) {
          await this.prisma.inventoryItem.update({
            where: { id: item.id },
            data: {
              quantityOnHand: line.countedQty,
              quantityAvailable: line.countedQty - item.quantityAllocated,
              lastCountedAt: new Date(),
            },
          });
          await this.recordMovement(companyId, {
            type: 'CYCLE_COUNT', sku: line.sku, quantity: line.variance,
            fromBinId: line.variance < 0 ? item.binId : undefined,
            toBinId: line.variance > 0 ? item.binId : undefined,
            cycleCountId: id, reason: `Cycle count adjustment: ${cc.countNumber}`,
            performedBy: approvedBy,
          });
        }

        await this.prisma.cycleCountLine.update({
          where: { id: line.id },
          data: { resolved: true, adjustmentPosted: true, resolvedBy: approvedBy, resolvedAt: new Date() },
        });
      }
    }

    await this.prisma.cycleCount.update({
      where: { id },
      data: { status: 'APPROVED', approvedAt: new Date(), approvedBy },
    });

    return { countNumber: cc.countNumber, status: 'APPROVED', adjustmentsPosted: cc.totalVariances };
  }


  // ═══════════════════════════════════════════════════════════════════════
  // AI ASSIST — Intelligent warehouse operations
  // ═══════════════════════════════════════════════════════════════════════

  /** AI suggests the optimal bin for put-away (considers zone type, capacity, FEFO) */
  async aiSuggestPutAwayBin(companyId: string, sku: string, quantity: number, warehouseId?: string) {
    // Strategy: find bins in BULK/PICK zones with same SKU or empty, sorted by pick sequence
    const candidates = await this.prisma.binLocation.findMany({
      where: {
        zone: {
          type: { in: ['BULK', 'PICK'] },
          ...(warehouseId ? { warehouseId } : {}),
        },
        isBlocked: false,
        OR: [
          { isEmpty: true },
          { inventory: { some: { companyId, sku } } },
        ],
      },
      include: {
        zone: true,
        inventory: { where: { companyId, sku }, select: { quantityOnHand: true } },
      },
      orderBy: { pickSequence: 'asc' },
      take: 5,
    });

    // Score: prefer bins that already have the same SKU (consolidation)
    // then prefer empty bins in BULK zone, then by capacity
    const scored = candidates.map(bin => {
      let score = 100;
      const existingQty = bin.inventory.reduce((s, i) => s + i.quantityOnHand, 0);
      if (existingQty > 0) score += 50; // Consolidation bonus
      if (bin.zone.type === 'PICK') score += 20; // Pick zone preference for fast-movers
      if (bin.isEmpty) score += 10;
      if (bin.maxWeightKg && quantity * 0.5 > bin.maxWeightKg) score -= 80; // Over capacity
      return { ...bin, score, existingQty };
    }).sort((a, b) => b.score - a.score);

    return scored[0] || null;
  }

  /** AI suggests the optimal bin to pick from (FEFO + shortest path) */
  private async aiSuggestPickBin(companyId: string, sku: string, quantity: number) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { companyId, sku, quantityAvailable: { gte: quantity }, status: 'AVAILABLE' },
      include: { bin: true },
      orderBy: [
        { expiryDate: 'asc' },   // FEFO: earliest expiry first
        { bin: { pickSequence: 'asc' } }, // Then by pick sequence (proximity)
      ],
      take: 1,
    });
    return items[0]?.bin || null;
  }

  /** AI generates replenishment suggestions (bulk → pick face) */
  async aiReplenishmentSuggestions(companyId: string) {
    const lowStock = await this.prisma.inventoryItem.findMany({
      where: {
        companyId, status: 'AVAILABLE',
        bin: { zone: { type: 'PICK' } },
        reorderPoint: { not: null },
      },
      include: { bin: { include: { zone: true } } },
    });

    const suggestions = lowStock
      .filter(item => item.reorderPoint && item.quantityOnHand <= item.reorderPoint)
      .map(item => ({
        sku: item.sku,
        description: item.description,
        currentQty: item.quantityOnHand,
        reorderPoint: item.reorderPoint,
        suggestedQty: item.reorderQuantity || (item.reorderPoint! * 2),
        bin: item.bin.code,
        zone: item.bin.zone.name,
        urgency: item.quantityOnHand === 0 ? 'CRITICAL' : 'LOW',
      }));

    return suggestions.sort((a, b) =>
      a.urgency === 'CRITICAL' ? -1 : b.urgency === 'CRITICAL' ? 1 : a.currentQty - b.currentQty
    );
  }


  // ═══════════════════════════════════════════════════════════════════════
  // AI COPILOT — Groq-powered warehouse intelligence
  // ═══════════════════════════════════════════════════════════════════════

  async aiWarehouseInsights(companyId: string) {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey) return { insights: null, message: 'GROQ_API_KEY not configured.' };

    const [summary, movements, replenish] = await Promise.all([
      this.getInventorySummary(companyId),
      this.prisma.stockMovement.count({ where: { companyId, performedAt: { gte: new Date(Date.now() - 7 * 86400000) } } }),
      this.aiReplenishmentSuggestions(companyId),
    ]);

    const prompt = `You are an AI warehouse operations advisor for a South African logistics company.

Analyse this warehouse data and provide strategic recommendations:

INVENTORY SUMMARY:
- Total SKUs: ${summary.totalSKUs}
- Total Units: ${summary.totalUnits}
- Total Value: R${summary.totalValue.toLocaleString()}
- Allocated: ${summary.allocated}
- Expiring within 30 days: ${summary.expiringSoon}
- Damaged items: ${summary.damaged}

ACTIVITY (last 7 days):
- Stock movements: ${movements}

REPLENISHMENT NEEDED:
- ${replenish.length} items below reorder point
- Critical (zero stock in pick face): ${replenish.filter(r => r.urgency === 'CRITICAL').length}

Return ONLY valid JSON:
{
  "healthScore": 0-100,
  "summary": "2-3 sentence overview",
  "alerts": ["...", "..."],
  "recommendations": ["...", "...", "..."],
  "optimizations": ["...", "..."]
}`;

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3, max_tokens: 600,
        }),
      });
      if (!res.ok) return { insights: null, message: 'AI service unavailable.' };
      const body: any = await res.json();
      const content = body?.choices?.[0]?.message?.content;
      return { insights: content ? JSON.parse(content.trim()) : null, generatedAt: new Date().toISOString() };
    } catch (err) {
      this.logger.error(`WMS AI insights failed: ${err}`);
      return { insights: null, message: 'AI analysis failed.' };
    }
  }


  // ═══════════════════════════════════════════════════════════════════════
  // STOCK MOVEMENT RECORDING & HISTORY
  // ═══════════════════════════════════════════════════════════════════════

  private async recordMovement(companyId: string, dto: {
    type: string; sku: string; quantity: number;
    fromBinId?: string; toBinId?: string;
    goodsReceiptId?: string; pickOrderId?: string; cycleCountId?: string;
    reason?: string; performedBy?: string;
  }) {
    await this.prisma.stockMovement.create({
      data: { ...withCompanyId(companyId, dto), performedAt: new Date() } as any,
    });
  }

  async getMovementHistory(companyId: string, filters?: {
    sku?: string; type?: string; days?: number;
  }) {
    const where: any = { companyId };
    if (filters?.sku) where.sku = filters.sku;
    if (filters?.type) where.type = filters.type;
    if (filters?.days) {
      where.performedAt = { gte: new Date(Date.now() - filters.days * 86400000) };
    }

    return this.prisma.stockMovement.findMany({
      where,
      include: { fromBin: { select: { code: true } } },
      orderBy: { performedAt: 'desc' },
      take: 200,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TRANSFER BETWEEN BINS
  // ═══════════════════════════════════════════════════════════════════════

  async transferStock(companyId: string, dto: {
    sku: string; quantity: number; fromBinId: string; toBinId: string;
    reason?: string; performedBy?: string;
  }) {
    const source = await this.prisma.inventoryItem.findFirst({
      where: { companyId, binId: dto.fromBinId, sku: dto.sku },
    });
    if (!source) throw new NotFoundException('SKU not found in source bin');
    if (source.quantityAvailable < dto.quantity) {
      throw new BadRequestException(`Insufficient available stock (have ${source.quantityAvailable}, need ${dto.quantity})`);
    }

    // Deduct from source
    await this.prisma.inventoryItem.update({
      where: { id: source.id },
      data: {
        quantityOnHand: { decrement: dto.quantity },
        quantityAvailable: { decrement: dto.quantity },
        lastMovedAt: new Date(),
      },
    });

    // Add to destination
    const dest = await this.prisma.inventoryItem.findFirst({
      where: { companyId, binId: dto.toBinId, sku: dto.sku },
    });
    if (dest) {
      await this.prisma.inventoryItem.update({
        where: { id: dest.id },
        data: {
          quantityOnHand: { increment: dto.quantity },
          quantityAvailable: { increment: dto.quantity },
          lastMovedAt: new Date(),
        },
      });
    } else {
      await this.prisma.inventoryItem.create({
        data: {
          companyId, binId: dto.toBinId, sku: dto.sku,
          description: source.description, category: source.category,
          quantityOnHand: dto.quantity, quantityAvailable: dto.quantity,
          batchNumber: source.batchNumber, expiryDate: source.expiryDate,
          unitCost: source.unitCost, status: 'AVAILABLE', lastMovedAt: new Date(),
        },
      });
    }

    // Update bin states
    const sourceRemaining = source.quantityOnHand - dto.quantity;
    if (sourceRemaining <= 0) {
      await this.prisma.binLocation.update({ where: { id: dto.fromBinId }, data: { isEmpty: true } });
    }
    await this.prisma.binLocation.update({ where: { id: dto.toBinId }, data: { isEmpty: false } });

    await this.recordMovement(companyId, {
      type: 'TRANSFER', sku: dto.sku, quantity: dto.quantity,
      fromBinId: dto.fromBinId, toBinId: dto.toBinId,
      reason: dto.reason || 'Stock transfer', performedBy: dto.performedBy,
    });

    return { sku: dto.sku, quantity: dto.quantity, from: dto.fromBinId, to: dto.toBinId };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DASHBOARD OVERVIEW
  // ═══════════════════════════════════════════════════════════════════════

  async getDashboard(companyId: string) {
    const [summary, warehouses, pendingReceipts, activePicks, replenish] = await Promise.all([
      this.getInventorySummary(companyId),
      this.prisma.warehouse.count({ where: { companyId, isActive: true } }),
      this.prisma.goodsReceipt.count({ where: { companyId, status: { in: ['EXPECTED', 'ARRIVED'] } } }),
      this.prisma.pickOrder.count({ where: { companyId, status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] } } }),
      this.aiReplenishmentSuggestions(companyId),
    ]);

    const todayMovements = await this.prisma.stockMovement.count({
      where: { companyId, performedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    });

    return {
      inventory: summary,
      warehouses,
      pendingReceipts,
      activePicks,
      replenishmentNeeded: replenish.length,
      criticalReplenishment: replenish.filter(r => r.urgency === 'CRITICAL').length,
      todayMovements,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CROSS-DOCKING (Bypass Storage — Direct Inbound → Outbound)
  // ═══════════════════════════════════════════════════════════════════════

  async createCrossDock(companyId: string, dto: {
    warehouseId: string;
    supplierName?: string;
    inboundRef?: string;
    lines: { sku: string; quantity: number; destinationClient: string; destinationAddress?: string }[];
  }) {
    const count = await this.prisma.goodsReceipt.count({ where: { companyId } });
    const receiptNumber = `XD-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    // Create a goods receipt flagged as cross-dock (no put-away, goes direct to outbound)
    const gr = await this.prisma.goodsReceipt.create({
      data: {
        companyId, warehouseId: dto.warehouseId, receiptNumber,
        supplierName: dto.supplierName, poNumber: dto.inboundRef,
        expectedLines: dto.lines.length,
        expectedQty: dto.lines.reduce((s, l) => s + l.quantity, 0),
        status: 'ARRIVED',
        arrivedAt: new Date(),
        lines: { create: dto.lines.map(l => ({ sku: l.sku, expectedQty: l.quantity, description: l.destinationClient })) },
      },
      include: { lines: true },
    });

    // Auto-create pick orders for each destination (bypass storage entirely)
    const pickOrders: any[] = [];
    const grouped: Record<string, typeof dto.lines> = {};
    for (const line of dto.lines) {
      const key = line.destinationClient;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(line);
    }

    for (const [client, lines] of Object.entries(grouped)) {
      const poCount = await this.prisma.pickOrder.count({ where: { companyId } });
      const orderNumber = `XD-PO-${new Date().getFullYear()}-${String(poCount + 1).padStart(5, '0')}`;
      const po = await this.prisma.pickOrder.create({
        data: {
          companyId, warehouseId: dto.warehouseId, orderNumber,
          sourceType: 'CROSS_DOCK', sourceId: gr.id,
          clientName: client, shipToName: client,
          shipToAddress: lines[0]?.destinationAddress || '',
          priority: 10, // High priority — cross-dock is time-sensitive
          totalLines: lines.length,
          totalQty: lines.reduce((s, l) => s + l.quantity, 0),
          lines: { create: lines.map(l => ({ sku: l.sku, requestedQty: l.quantity })) },
        },
        include: { lines: true },
      });
      pickOrders.push(po);
    }

    await this.recordMovement(companyId, {
      type: 'CROSS_DOCK', sku: dto.lines.map(l => l.sku).join(', '),
      quantity: dto.lines.reduce((s, l) => s + l.quantity, 0),
      reason: `Cross-dock: ${dto.supplierName || 'inbound'} → ${Object.keys(grouped).length} destinations`,
    });

    this.logger.log(`Cross-dock ${receiptNumber}: ${dto.lines.length} lines → ${pickOrders.length} pick orders`);

    return {
      receiptNumber,
      goodsReceiptId: gr.id,
      pickOrders: pickOrders.map(po => ({ id: po.id, orderNumber: po.orderNumber, client: po.clientName })),
      totalItems: dto.lines.reduce((s, l) => s + l.quantity, 0),
      destinations: Object.keys(grouped).length,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // WAVE PLANNING (Group Picks Into Efficient Waves)
  // ═══════════════════════════════════════════════════════════════════════

  async createWave(companyId: string, warehouseId: string, dto?: {
    maxOrders?: number; maxLines?: number; priority?: string; zoneFilter?: string;
  }) {
    const maxOrders = dto?.maxOrders || 20;
    const maxLines = dto?.maxLines || 100;

    // Find pending pick orders, prioritized
    const pendingPicks = await this.prisma.pickOrder.findMany({
      where: {
        companyId, warehouseId, status: 'PENDING',
        ...(dto?.priority ? { priority: { gte: parseInt(dto.priority) } } : {}),
      },
      include: { lines: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: maxOrders,
    });

    if (pendingPicks.length === 0) {
      return { waveId: null, message: 'No pending pick orders to wave', orders: 0, lines: 0 };
    }

    // Group by zone for efficient picker routing
    const waveOrders: any[] = [];
    let totalLines = 0;

    for (const order of pendingPicks) {
      if (totalLines + order.totalLines > maxLines) break;
      waveOrders.push(order);
      totalLines += order.totalLines;
    }

    // Build zone-optimized pick sequence
    const allLines = waveOrders.flatMap(o => o.lines);
    const zoneGroups: Record<string, any[]> = {};

    for (const line of allLines) {
      if (line.suggestedBinId) {
        // Tenant-scoped read: a suggested bin id is client/data-derived, so a
        // lookup by id alone could pull another tenant's warehouse layout into
        // this wave. Restricted to the caller's company (and the warehouse).
        // BinLocation has no companyId of its own — tenancy comes from its
        // warehouse, so the relation filter is the tenant scope.
        const bin = await this.prisma.binLocation.findFirst({
          where: { id: line.suggestedBinId, zone: { warehouse: { companyId } } },
          include: { zone: true },
        });
        const zoneName = bin?.zone?.name || 'UNKNOWN';
        if (!zoneGroups[zoneName]) zoneGroups[zoneName] = [];
        zoneGroups[zoneName].push({ ...line, binCode: bin?.code, aisle: bin?.aisle });
      } else {
        if (!zoneGroups['UNASSIGNED']) zoneGroups['UNASSIGNED'] = [];
        zoneGroups['UNASSIGNED'].push(line);
      }
    }

    // Sort within each zone by aisle → rack → level (serpentine path)
    for (const zone of Object.keys(zoneGroups)) {
      zoneGroups[zone].sort((a: any, b: any) => (a.binCode || '').localeCompare(b.binCode || ''));
    }

    // Mark all wave orders as IN_PROGRESS
    const waveId = `WAVE-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
    // Claim every order with a company-scoped, status-guarded update: if the
    // pick order was already waved/reassigned between the read and this write,
    // it must not be silently re-claimed into a second wave.
    for (const order of waveOrders) {
      const claimed = await this.prisma.pickOrder.updateMany({
        where: { id: order.id, companyId, warehouseId, status: 'PENDING' },
        data: { status: 'IN_PROGRESS' },
      });
      if (claimed.count === 0) {
        this.logger.warn(`Pick order ${order.id} was claimed by another wave — skipping`);
      }
    }

    this.logger.log(`Wave ${waveId}: ${waveOrders.length} orders, ${totalLines} lines across ${Object.keys(zoneGroups).length} zones`);

    return {
      waveId,
      orders: waveOrders.length,
      lines: totalLines,
      zones: Object.keys(zoneGroups).length,
      pickSequence: zoneGroups,
      orderIds: waveOrders.map(o => o.id),
      estimatedPickTime: Math.ceil(totalLines * 0.8), // ~0.8 min per line estimate
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // AI SLOTTING OPTIMIZATION (Place Fast-Movers Near Dispatch)
  // ═══════════════════════════════════════════════════════════════════════

  async aiSlottingOptimization(companyId: string, _warehouseId: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

    // Get pick frequency per SKU (last 30 days)
    const pickFrequency = await (this.prisma.stockMovement as any).groupBy({
      by: ['sku'],
      where: { companyId, type: 'PICK', performedAt: { gte: thirtyDaysAgo } },
      _count: { _all: true },
      _sum: { quantity: true },
      orderBy: { _count: { _all: 'desc' } },
    }) as { sku: string; _count: { _all: number }; _sum: { quantity: number | null } }[];

    // Get current bin locations for each SKU
    const inventory = await this.prisma.inventoryItem.findMany({
      where: { companyId, quantityOnHand: { gt: 0 } },
      include: { bin: { include: { zone: true } } },
    });

    // Classify into velocity bands (ABC analysis)
    const totalPicks = pickFrequency.reduce((s, p) => s + p._count._all, 0);
    let cumulative = 0;
    const velocityMap: Record<string, 'A' | 'B' | 'C'> = {};

    for (const pf of pickFrequency) {
      cumulative += pf._count._all;
      const pct = cumulative / totalPicks;
      velocityMap[pf.sku] = pct <= 0.2 ? 'A' : pct <= 0.5 ? 'B' : 'C';
    }

    // Generate recommendations
    const recommendations: any[] = [];

    for (const item of inventory) {
      const velocity = velocityMap[item.sku] || 'C';
      const isInPickZone = item.bin?.zone?.type === 'PICK';
      const pickSeq = item.bin?.pickSequence || 999;

      // A-class items should be in PICK zone with low pickSequence (close to dispatch)
      if (velocity === 'A' && !isInPickZone) {
        recommendations.push({
          sku: item.sku,
          description: item.description,
          currentBin: item.bin?.code,
          currentZone: item.bin?.zone?.name,
          velocity: 'A',
          picksLast30d: pickFrequency.find(p => p.sku === item.sku)?._count._all || 0,
          recommendation: 'MOVE_TO_PICK_ZONE',
          reason: 'High-velocity item currently in bulk storage — move to pick face for faster fulfilment',
          priority: 'HIGH',
        });
      }

      // A-class items in pick zone but far from dispatch (high pickSequence)
      if (velocity === 'A' && isInPickZone && pickSeq > 50) {
        recommendations.push({
          sku: item.sku,
          description: item.description,
          currentBin: item.bin?.code,
          currentZone: item.bin?.zone?.name,
          velocity: 'A',
          picksLast30d: pickFrequency.find(p => p.sku === item.sku)?._count._all || 0,
          recommendation: 'MOVE_CLOSER_TO_DISPATCH',
          reason: 'High-velocity item too far from pack/dispatch area — reduce walker distance',
          priority: 'MEDIUM',
        });
      }

      // C-class items wasting prime pick-face space
      if (velocity === 'C' && isInPickZone && pickSeq < 30) {
        recommendations.push({
          sku: item.sku,
          description: item.description,
          currentBin: item.bin?.code,
          currentZone: item.bin?.zone?.name,
          velocity: 'C',
          picksLast30d: pickFrequency.find(p => p.sku === item.sku)?._count._all || 0,
          recommendation: 'MOVE_TO_BULK',
          reason: 'Slow-mover occupying premium pick-face slot — free up space for fast-movers',
          priority: 'LOW',
        });
      }
    }

    // AI summary
    const aCount = Object.values(velocityMap).filter(v => v === 'A').length;
    const bCount = Object.values(velocityMap).filter(v => v === 'B').length;
    const cCount = Object.values(velocityMap).filter(v => v === 'C').length;
    const misplacedA = recommendations.filter(r => r.velocity === 'A').length;

    return {
      velocityAnalysis: { A: aCount, B: bCount, C: cCount, totalSKUs: pickFrequency.length },
      recommendations: recommendations.slice(0, 50),
      summary: {
        totalRecommendations: recommendations.length,
        highPriority: recommendations.filter(r => r.priority === 'HIGH').length,
        // No pick-time saving is estimated here: the ABC rules identify
        // candidate moves, but any time saving depends on warehouse layout
        // and must be measured after relocation — it is not computed.
        estimatedPickTimeReduction: null,
        message: misplacedA > 0
          ? `${misplacedA} high-velocity items are in suboptimal locations. Review the suggested moves against your layout before relocating stock.`
          : 'No urgent moves suggested by the current pick-frequency data.',
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BARCODE / QR SCAN VERIFICATION
  // ═══════════════════════════════════════════════════════════════════════

  async verifyScan(companyId: string, dto: {
    barcode: string;
    context: 'RECEIVE' | 'PICK' | 'PUT_AWAY' | 'TRANSFER' | 'CYCLE_COUNT';
    expectedSku?: string;
    expectedBin?: string;
    expectedQuantity?: number;
  }) {
    const barcode = dto.barcode.trim();

    // Try to match: SKU, bin code, goods receipt number, pick order number
    const [itemBySku, binByCode, grByNumber, poByNumber] = await Promise.all([
      this.prisma.inventoryItem.findFirst({
        where: { companyId, sku: barcode },
        include: { bin: { include: { zone: true } } },
      }),
      this.prisma.binLocation.findFirst({
        where: { code: barcode, zone: { warehouse: { companyId } } },
        include: { zone: true, inventory: { where: { quantityOnHand: { gt: 0 } }, take: 5 } },
      }),
      this.prisma.goodsReceipt.findFirst({ where: { companyId, receiptNumber: barcode } }),
      this.prisma.pickOrder.findFirst({ where: { companyId, orderNumber: barcode } }),
    ]);

    const result: any = {
      barcode,
      context: dto.context,
      matched: false,
      type: null,
      data: null,
      verification: { valid: false, errors: [] as string[] },
    };

    if (itemBySku) {
      result.matched = true;
      result.type = 'SKU';
      result.data = {
        sku: itemBySku.sku,
        description: itemBySku.description,
        bin: itemBySku.bin?.code,
        zone: itemBySku.bin?.zone?.name,
        quantityOnHand: itemBySku.quantityOnHand,
        batchNumber: itemBySku.batchNumber,
        expiryDate: itemBySku.expiryDate,
      };
      // Verify against expected
      if (dto.expectedSku && dto.expectedSku !== barcode) {
        result.verification.errors.push(`Expected SKU ${dto.expectedSku}, scanned ${barcode}`);
      } else {
        result.verification.valid = true;
      }
    } else if (binByCode) {
      result.matched = true;
      result.type = 'BIN';
      result.data = {
        binCode: binByCode.code,
        zone: binByCode.zone?.name,
        isEmpty: binByCode.isEmpty,
        contents: binByCode.inventory.map(i => ({ sku: i.sku, qty: i.quantityOnHand })),
      };
      if (dto.expectedBin && dto.expectedBin !== barcode) {
        result.verification.errors.push(`Expected bin ${dto.expectedBin}, scanned ${barcode}`);
      } else {
        result.verification.valid = true;
      }
    } else if (grByNumber) {
      result.matched = true;
      result.type = 'GOODS_RECEIPT';
      result.data = { receiptNumber: grByNumber.receiptNumber, status: grByNumber.status, supplier: grByNumber.supplierName };
      result.verification.valid = true;
    } else if (poByNumber) {
      result.matched = true;
      result.type = 'PICK_ORDER';
      result.data = { orderNumber: poByNumber.orderNumber, status: poByNumber.status, client: poByNumber.clientName };
      result.verification.valid = true;
    } else {
      result.verification.errors.push(`Barcode "${barcode}" not found in system`);
    }

    return result;
  }
}

/**
 * Minimal actor context for the Process Control bridge. The WMS DTOs carry the
 * acting user as `receivedBy`/`performedBy` rather than a JWT payload, so the
 * bridge is given the same identifiers the WMS already records.
 */
function actorFrom(dto: any) {
  return {
    userId: dto?.receivedBy ?? dto?.performedBy ?? null,
    name: dto?.receivedByName ?? dto?.receivedBy ?? null,
    role: dto?.actorRole ?? 'WAREHOUSE',
    permissions: null,
  };
}
