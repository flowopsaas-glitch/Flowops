import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WarehouseManagementService {
  private readonly logger = new Logger(WarehouseManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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
      data: { companyId, ...dto },
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

  async createBin(zoneId: string, dto: any) {
    return this.prisma.binLocation.create({
      data: { zoneId, ...dto },
    });
  }

  async bulkCreateBins(zoneId: string, dto: {
    aisle: string; rack: string; levels: number; positions: number;
    binType?: string; maxWeightKg?: number;
  }) {
    const bins: any[] = [];
    const zone = await this.prisma.warehouseZone.findUnique({ where: { id: zoneId } });
    if (!zone) throw new NotFoundException('Zone not found');

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

    return this.prisma.goodsReceipt.create({
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
        });
      }
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

    return { receiptNumber: gr.receiptNumber, received: totalReceived, damaged: totalDamaged };
  }

  private async putAwayStock(companyId: string, dto: {
    binId: string; sku: string; quantity: number; batchNumber?: string;
    expiryDate?: Date; goodsReceiptId?: string; performedBy?: string;
  }) {
    // Find or create inventory item at this bin
    let item = await this.prisma.inventoryItem.findFirst({
      where: { companyId, binId: dto.binId, sku: dto.sku, batchNumber: dto.batchNumber || null },
    });

    if (item) {
      await this.prisma.inventoryItem.update({
        where: { id: item.id },
        data: {
          quantityOnHand: { increment: dto.quantity },
          quantityAvailable: { increment: dto.quantity },
          lastMovedAt: new Date(),
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
    return this.prisma.pickOrder.update({
      where: { id: pickOrderId },
      data: { assignedTo: userId, assignedAt: new Date(), status: 'ASSIGNED' },
    });
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
    let countedBins = new Set<string>();

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
          model: 'llama-3.3-70b-versatile',
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
      data: { companyId, ...dto, performedAt: new Date() } as any,
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
    let dest = await this.prisma.inventoryItem.findFirst({
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
}
