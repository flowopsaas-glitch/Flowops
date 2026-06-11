import {
  Controller, Get, Post, Put, Delete, Patch,
  Body, Param, Query, Req, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InventoryService } from './inventory.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { StockMovementDto } from './dto/stock-movement.dto';

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ==================== DASHBOARD ====================
  
  @Get('metrics')
  async getMetrics(@Req() req: any) {
    return this.inventoryService.getMetrics(req.user.companyId);
  }

  @Get('alerts')
  async getAlerts(@Req() req: any, @Query('unreadOnly') unreadOnly?: string) {
    return this.inventoryService.getAlerts(req.user.companyId, unreadOnly === 'true');
  }

  @Patch('alerts/:id/read')
  async markAlertRead(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.inventoryService.markAlertRead(id, req.user.companyId);
  }

  // ==================== WAREHOUSES ====================
  
  @Get('warehouses')
  async getWarehouses(@Req() req: any) {
    return this.inventoryService.getWarehouses(req.user.companyId);
  }

  @Get('warehouses/:id')
  async getWarehouse(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.inventoryService.getWarehouse(id, req.user.companyId);
  }

  @Post('warehouses')
  async createWarehouse(@Body() dto: CreateWarehouseDto, @Req() req: any) {
    return this.inventoryService.createWarehouse(req.user.companyId, dto);
  }

  @Patch('warehouses/:id')
  async updateWarehouse(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateWarehouseDto>,
    @Req() req: any,
  ) {
    return this.inventoryService.updateWarehouse(id, req.user.companyId, dto);
  }

  @Delete('warehouses/:id')
  async deleteWarehouse(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.inventoryService.deleteWarehouse(id, req.user.companyId);
  }

  // ==================== LOCATIONS ====================
  
  @Get('warehouses/:warehouseId/locations')
  async getLocations(
    @Param('warehouseId', ParseIntPipe) warehouseId: number,
    @Req() req: any,
  ) {
    return this.inventoryService.getLocations(warehouseId, req.user.companyId);
  }

  @Post('warehouses/:warehouseId/locations')
  async createLocation(
    @Param('warehouseId', ParseIntPipe) warehouseId: number,
    @Body() data: any,
    @Req() req: any,
  ) {
    return this.inventoryService.createLocation(warehouseId, req.user.companyId, data);
  }

  // ==================== CATEGORIES ====================
  
  @Get('categories')
  async getCategories(@Req() req: any) {
    return this.inventoryService.getCategories(req.user.companyId);
  }

  @Post('categories')
  async createCategory(@Body() data: any, @Req() req: any) {
    return this.inventoryService.createCategory(req.user.companyId, data);
  }

  // ==================== ITEMS ====================
  
  @Get('items')
  async getItems(
    @Req() req: any,
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.inventoryService.getItems(req.user.companyId, {
      categoryId: categoryId ? parseInt(categoryId) : undefined,
      search,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
  }

  @Get('items/:id')
  async getItem(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.inventoryService.getItem(id, req.user.companyId);
  }

  @Get('items/barcode/:barcode')
  async getItemByBarcode(@Param('barcode') barcode: string, @Req() req: any) {
    return this.inventoryService.getItemByBarcode(barcode, req.user.companyId);
  }

  @Post('items')
  async createItem(@Body() dto: CreateItemDto, @Req() req: any) {
    return this.inventoryService.createItem(req.user.companyId, dto);
  }

  @Patch('items/:id')
  async updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateItemDto>,
    @Req() req: any,
  ) {
    return this.inventoryService.updateItem(id, req.user.companyId, dto);
  }

  @Delete('items/:id')
  async deleteItem(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.inventoryService.deleteItem(id, req.user.companyId);
  }

  // ==================== MOVEMENTS ====================
  
  @Get('movements')
  async getMovements(
    @Req() req: any,
    @Query('itemId') itemId?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
  ) {
    return this.inventoryService.getMovements(req.user.companyId, {
      itemId: itemId ? parseInt(itemId) : undefined,
      type,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Post('movements')
  async recordMovement(@Body() dto: StockMovementDto, @Req() req: any) {
    return this.inventoryService.recordMovement(
      req.user.companyId,
      req.user.id,
      dto,
    );
  }
}
