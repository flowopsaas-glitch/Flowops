import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WarehouseManagementService } from './warehouse-management.service';
import { WarehouseAnalyticsService } from './warehouse-analytics.service';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('Warehouse Management')
@ApiBearerAuth()
@Controller('wms')
export class WarehouseController {
  constructor(
    private readonly wms: WarehouseManagementService,
    private readonly analytics: WarehouseAnalyticsService,
  ) {}

  // ── Dashboard ──────────────────────────────────────────────────────────
  @Get('dashboard')
  getDashboard(@CurrentUser() u: any) {
    return this.wms.getDashboard(u.companyId);
  }

  @Get('kpis')
  getKpis(@CurrentUser() u: any, @Query('days') days?: string) {
    return this.analytics.getKpis(u.companyId, days ? +days : 30);
  }

  @Get('ai-insights')
  getAiInsights(@CurrentUser() u: any) {
    return this.wms.aiWarehouseInsights(u.companyId);
  }

  // ── Warehouses ─────────────────────────────────────────────────────────
  @Get('warehouses')
  listWarehouses(@CurrentUser() u: any) {
    return this.wms.listWarehouses(u.companyId);
  }

  @Post('warehouses')
  createWarehouse(@CurrentUser() u: any, @Body() dto: any) {
    return this.wms.createWarehouse(u.companyId, dto);
  }

  @Get('warehouses/:id')
  getWarehouse(@CurrentUser() u: any, @Param('id') id: string) {
    return this.wms.getWarehouse(id, u.companyId);
  }


  // ── Zones & Bins ───────────────────────────────────────────────────────
  @Post('warehouses/:id/zones')
  createZone(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: any) {
    return this.wms.createZone(id, u.companyId, dto);
  }

  @Post('zones/:zoneId/bins')
  createBin(@Param('zoneId') zoneId: string, @Body() dto: any) {
    return this.wms.createBin(zoneId, dto);
  }

  @Post('zones/:zoneId/bins/bulk')
  bulkCreateBins(@Param('zoneId') zoneId: string, @Body() dto: any) {
    return this.wms.bulkCreateBins(zoneId, dto);
  }

  // ── Inventory ──────────────────────────────────────────────────────────
  @Get('inventory')
  getInventory(@CurrentUser() u: any, @Query() filters: any) {
    return this.wms.getInventory(u.companyId, filters);
  }

  @Get('inventory/summary')
  getInventorySummary(@CurrentUser() u: any) {
    return this.wms.getInventorySummary(u.companyId);
  }

  @Post('inventory/adjust')
  adjustStock(@CurrentUser() u: any, @Body() dto: any) {
    return this.wms.adjustStock(u.companyId, { ...dto, performedBy: u.id });
  }

  @Post('inventory/transfer')
  transferStock(@CurrentUser() u: any, @Body() dto: any) {
    return this.wms.transferStock(u.companyId, { ...dto, performedBy: u.id });
  }

  // ── AI Assist ──────────────────────────────────────────────────────────
  @Get('ai/put-away-suggestion')
  suggestPutAway(@CurrentUser() u: any, @Query('sku') sku: string,
    @Query('quantity') qty: string, @Query('warehouseId') whId?: string) {
    return this.wms.aiSuggestPutAwayBin(u.companyId, sku, +qty, whId);
  }

  @Get('ai/replenishment')
  getReplenishment(@CurrentUser() u: any) {
    return this.wms.aiReplenishmentSuggestions(u.companyId);
  }

  // ── Goods Receipt ──────────────────────────────────────────────────────
  @Post('receipts')
  createReceipt(@CurrentUser() u: any, @Body() dto: any) {
    return this.wms.createGoodsReceipt(u.companyId, dto.warehouseId, dto);
  }

  @Post('receipts/:id/receive')
  receiveGoods(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: any) {
    return this.wms.receiveGoods(id, u.companyId, { ...dto, receivedBy: u.id });
  }


  // ── Pick Orders ────────────────────────────────────────────────────────
  @Post('picks')
  createPickOrder(@CurrentUser() u: any, @Body() dto: any) {
    return this.wms.createPickOrder(u.companyId, dto.warehouseId, dto);
  }

  @Patch('picks/:id/assign')
  assignPicker(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: any) {
    return this.wms.assignPicker(id, u.companyId, dto.userId || u.id);
  }

  @Post('picks/:id/confirm')
  confirmPick(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: any) {
    return this.wms.confirmPick(id, u.companyId, dto);
  }

  // ── Cycle Counts ───────────────────────────────────────────────────────
  @Post('counts')
  createCycleCount(@CurrentUser() u: any, @Body() dto: any) {
    return this.wms.createCycleCount(u.companyId, dto.warehouseId, dto);
  }

  @Post('counts/:id/submit')
  submitCount(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: any) {
    return this.wms.submitCycleCount(id, u.companyId, dto);
  }

  @Post('counts/:id/approve')
  approveCount(@CurrentUser() u: any, @Param('id') id: string) {
    return this.wms.approveCycleCount(id, u.companyId, u.id);
  }

  // ── Stock Movements ────────────────────────────────────────────────────
  @Get('movements')
  getMovements(@CurrentUser() u: any, @Query() filters: any) {
    return this.wms.getMovementHistory(u.companyId, filters);
  }
}
