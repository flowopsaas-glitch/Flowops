import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { StockMovementDto } from './dto/stock-movement.dto';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  // ==================== WAREHOUSES ====================
  
  async getWarehouses(companyId: number) {
    return this.prisma.warehouse.findMany({
      where: { companyId, isActive: true },
      include: {
        locations: { where: { isActive: true } },
        _count: { select: { stock: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getWarehouse(id: number, companyId: number) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, companyId },
      include: {
        locations: { where: { isActive: true } },
        stock: {
          include: {
            item: true,
            location: true,
          },
        },
      },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    return warehouse;
  }

  async createWarehouse(companyId: number, dto: CreateWarehouseDto) {
    const existing = await this.prisma.warehouse.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('Warehouse code already exists');
    
    return this.prisma.warehouse.create({
      data: { ...dto, companyId },
    });
  }

  async updateWarehouse(id: number, companyId: number, dto: Partial<CreateWarehouseDto>) {
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id, companyId } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    
    return this.prisma.warehouse.update({
      where: { id },
      data: dto,
    });
  }

  async deleteWarehouse(id: number, companyId: number) {
    const warehouse = await this.prisma.warehouse.findFirst({ 
      where: { id, companyId },
      include: { _count: { select: { stock: true } } }
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    if (warehouse._count.stock > 0) throw new BadRequestException('Cannot delete warehouse with stock');
    
    return this.prisma.warehouse.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ==================== STORAGE LOCATIONS ====================
  
  async getLocations(warehouseId: number, companyId: number) {
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: warehouseId, companyId } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    
    return this.prisma.storageLocation.findMany({
      where: { warehouseId, isActive: true },
      include: { _count: { select: { stock: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async createLocation(warehouseId: number, companyId: number, data: any) {
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: warehouseId, companyId } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    
    return this.prisma.storageLocation.create({
      data: { ...data, warehouseId },
    });
  }

  // ==================== INVENTORY ITEMS ====================
  
  async getItems(companyId: number, filters?: { categoryId?: number; search?: string; isActive?: boolean }) {
    const where: any = { companyId };
    if (filters?.categoryId) where.categoryId = filters.categoryId;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { sku: { contains: filters.search, mode: 'insensitive' } },
        { barcode: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    
    return this.prisma.inventoryItem.findMany({
      where,
      include: {
        category: true,
        stock: {
          include: { location: { include: { warehouse: true } } },
        },
        _count: { select: { movements: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getItem(id: number, companyId: number) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, companyId },
      include: {
        category: true,
        stock: {
          include: { location: { include: { warehouse: true } } },
        },
        movements: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: { fromLocation: true, toLocation: true },
        },
      },
    });
    if (!item) throw new NotFoundException('Item not found');
    return item;
  }

  async getItemByBarcode(barcode: string, companyId: number) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { 
        companyId,
        OR: [{ barcode }, { qrCode: barcode }, { sku: barcode }]
      },
      include: {
        category: true,
        stock: {
          include: { location: { include: { warehouse: true } } },
        },
      },
    });
    if (!item) throw new NotFoundException('Item not found');
    return item;
  }

  async createItem(companyId: number, dto: CreateItemDto) {
    const existing = await this.prisma.inventoryItem.findFirst({
      where: { companyId, sku: dto.sku },
    });
    if (existing) throw new ConflictException('SKU already exists for this company');
    
    return this.prisma.inventoryItem.create({
      data: { ...dto, companyId },
    });
  }

  async updateItem(id: number, companyId: number, dto: Partial<CreateItemDto>) {
    const item = await this.prisma.inventoryItem.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException('Item not found');
    
    return this.prisma.inventoryItem.update({
      where: { id },
      data: dto,
    });
  }

  async deleteItem(id: number, companyId: number) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, companyId },
      include: { _count: { select: { stock: true, movements: true } } }
    });
    if (!item) throw new NotFoundException('Item not found');
    if (item._count.stock > 0 || item._count.movements > 0) {
      throw new BadRequestException('Cannot delete item with stock or movement history');
    }
    
    return this.prisma.inventoryItem.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ==================== CATEGORIES ====================
  
  async getCategories(companyId: number) {
    return this.prisma.inventoryCategory.findMany({
      where: { companyId, isActive: true },
      include: { 
        _count: { select: { items: true, children: true } },
        children: { where: { isActive: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(companyId: number, data: any) {
    return this.prisma.inventoryCategory.create({
      data: { ...data, companyId },
    });
  }

  // ==================== STOCK MOVEMENTS ====================
  
  async recordMovement(companyId: number, userId: number, dto: StockMovementDto) {
    return this.prisma.$transaction(async (tx) => {
      // Validate item
      const item = await tx.inventoryItem.findFirst({
        where: { id: dto.itemId, companyId },
      });
      if (!item) throw new NotFoundException('Item not found');

      // Validate locations if provided
      if (dto.fromLocationId) {
        const fromLoc = await tx.storageLocation.findUnique({ where: { id: dto.fromLocationId } });
        if (!fromLoc) throw new NotFoundException('From location not found');
      }
      if (dto.toLocationId) {
        const toLoc = await tx.storageLocation.findUnique({ where: { id: dto.toLocationId } });
        if (!toLoc) throw new NotFoundException('To location not found');
      }

      // Get or create stock record
      let stockRecord;
      
      if (dto.type === 'IN' || dto.type === 'RETURN') {
        if (!dto.toLocationId) throw new BadRequestException('Destination location required for IN/RETURN');
        
        stockRecord = await tx.stock.upsert({
          where: {
            itemId_locationId_batchNumber: {
              itemId: dto.itemId,
              locationId: dto.toLocationId,
              batchNumber: dto.batchNumber || '',
            },
          },
          update: { quantity: { increment: dto.quantity } },
          create: {
            itemId: dto.itemId,
            locationId: dto.toLocationId,
            warehouseId: (await tx.storageLocation.findUnique({ where: { id: dto.toLocationId } })).warehouseId,
            quantity: dto.quantity,
            batchNumber: dto.batchNumber,
          },
        });
      } else if (dto.type === 'OUT') {
        if (!dto.fromLocationId) throw new BadRequestException('Source location required for OUT');
        
        stockRecord = await tx.stock.findFirst({
          where: {
            itemId: dto.itemId,
            locationId: dto.fromLocationId,
            batchNumber: dto.batchNumber || '',
          },
        });
        if (!stockRecord || stockRecord.quantity < dto.quantity) {
          throw new BadRequestException(`Insufficient stock. Available: ${stockRecord?.quantity || 0}`);
        }
        
        stockRecord = await tx.stock.update({
          where: { id: stockRecord.id },
          data: { quantity: { decrement: dto.quantity } },
        });
      } else if (dto.type === 'TRANSFER') {
        if (!dto.fromLocationId || !dto.toLocationId) {
          throw new BadRequestException('Both source and destination required for TRANSFER');
        }
        
        const fromStock = await tx.stock.findFirst({
          where: { itemId: dto.itemId, locationId: dto.fromLocationId },
        });
        if (!fromStock || fromStock.quantity < dto.quantity) {
          throw new BadRequestException(`Insufficient stock. Available: ${fromStock?.quantity || 0}`);
        }
        
        // Decrement from source
        await tx.stock.update({
          where: { id: fromStock.id },
          data: { quantity: { decrement: dto.quantity } },
        });
        
        // Increment to destination
        const toWarehouseId = (await tx.storageLocation.findUnique({ where: { id: dto.toLocationId } })).warehouseId;
        stockRecord = await tx.stock.upsert({
          where: {
            itemId_locationId_batchNumber: {
              itemId: dto.itemId,
              locationId: dto.toLocationId,
              batchNumber: dto.batchNumber || '',
            },
          },
          update: { quantity: { increment: dto.quantity } },
          create: {
            itemId: dto.itemId,
            locationId: dto.toLocationId,
            warehouseId: toWarehouseId,
            quantity: dto.quantity,
            batchNumber: dto.batchNumber,
          },
        });
      } else if (dto.type === 'ADJUSTMENT') {
        if (!dto.toLocationId) throw new BadRequestException('Location required for ADJUSTMENT');
        
        stockRecord = await tx.stock.upsert({
          where: {
            itemId_locationId_batchNumber: {
              itemId: dto.itemId,
              locationId: dto.toLocationId,
              batchNumber: dto.batchNumber || '',
            },
          },
          update: { quantity: dto.quantity > 0 ? { increment: dto.quantity } : { decrement: Math.abs(dto.quantity) } },
          create: {
            itemId: dto.itemId,
            locationId: dto.toLocationId,
            warehouseId: (await tx.storageLocation.findUnique({ where: { id: dto.toLocationId } })).warehouseId,
            quantity: Math.abs(dto.quantity),
            batchNumber: dto.batchNumber,
          },
        });
      }

      // Record the movement
      const movement = await tx.stockMovement.create({
        data: {
          companyId,
          itemId: dto.itemId,
          fromLocationId: dto.fromLocationId,
          toLocationId: dto.toLocationId,
          quantity: dto.quantity,
          type: dto.type,
          reference: dto.reference,
          referenceType: dto.referenceType,
          notes: dto.notes,
          userId,
          batchNumber: dto.batchNumber,
        },
      });

      // Check for low stock alerts
      await this.checkLowStockAlerts(tx, companyId, dto.itemId);

      return movement;
    });
  }

  async getMovements(companyId: number, filters?: { itemId?: number; type?: string; limit?: number }) {
    const where: any = { companyId };
    if (filters?.itemId) where.itemId = filters.itemId;
    if (filters?.type) where.type = filters.type;
    
    return this.prisma.stockMovement.findMany({
      where,
      include: {
        item: true,
        fromLocation: { include: { warehouse: true } },
        toLocation: { include: { warehouse: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 50,
    });
  }

  // ==================== ALERTS ====================
  
  private async checkLowStockAlerts(tx: any, companyId: number, itemId: number) {
    const item = await tx.inventoryItem.findUnique({
      where: { id: itemId },
      include: { stock: true },
    });
    
    if (!item) return;
    
    const totalStock = item.stock.reduce((sum, s) => sum + s.quantity, 0);
    
    if (totalStock <= item.reorderPoint) {
      // Check if alert already exists and is unresolved
      const existingAlert = await tx.stockAlert.findFirst({
        where: {
          companyId,
          itemId,
          type: 'LOW_STOCK',
          isResolved: false,
        },
      });
      
      if (!existingAlert) {
        await tx.stockAlert.create({
          data: {
            companyId,
            itemId,
            type: 'LOW_STOCK',
            threshold: item.reorderPoint,
            message: `${item.name} is low on stock (${totalStock} remaining, reorder at ${item.reorderPoint})`,
          },
        });
      }
    }
  }

  async getAlerts(companyId: number, unreadOnly = false) {
    return this.prisma.stockAlert.findMany({
      where: {
        companyId,
        ...(unreadOnly && { isRead: false }),
      },
      include: { item: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markAlertRead(id: number, companyId: number) {
    return this.prisma.stockAlert.updateMany({
      where: { id, companyId },
      data: { isRead: true },
    });
  }

  // ==================== DASHBOARD METRICS ====================
  
  async getMetrics(companyId: number) {
    const [
      totalItems,
      totalWarehouses,
      totalStockValue,
      lowStockCount,
      recentMovements,
      movementsByType,
    ] = await Promise.all([
      this.prisma.inventoryItem.count({ where: { companyId, isActive: true } }),
      this.prisma.warehouse.count({ where: { companyId, isActive: true } }),
      this.prisma.stock.aggregate({
        where: {
          item: { companyId, isActive: true },
        },
        _sum: { quantity: true },
      }),
      this.prisma.stockAlert.count({
        where: {
          companyId,
          type: 'LOW_STOCK',
          isResolved: false,
        },
      }),
      this.prisma.stockMovement.count({
        where: {
          companyId,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.stockMovement.groupBy({
        by: ['type'],
        where: { companyId },
        _sum: { quantity: true },
      }),
    ]);

    return {
      totalItems,
      totalWarehouses,
      totalStockUnits: totalStockValue._sum.quantity || 0,
      lowStockAlerts: lowStockCount,
      movementsLast7Days: recentMovements,
      movementsByType,
    };
  }
}
