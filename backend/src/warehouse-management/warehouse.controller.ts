import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WarehouseManagementService } from './warehouse-management.service';
import { WarehouseAnalyticsService } from './warehouse-analytics.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../billing/require-feature.decorator';

const WMS_STRUCTURE_ROLES = [UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER] as const;

const WMS_OPERATION_ROLES = [
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE, UserRole.DISPATCH,
] as const;
const WAREHOUSE_READ_ROLES = [
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
  UserRole.WAREHOUSE, UserRole.DISPATCH,
];


@ApiTags('Warehouse Management')
@ApiBearerAuth()
@RequireFeature('warehouseManagement')
@Roles(...WAREHOUSE_READ_ROLES)
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

  @Roles(...WMS_STRUCTURE_ROLES)
  @Post('warehouses')
  createWarehouse(@CurrentUser() u: any, @Body() dto: any) {
    return this.wms.createWarehouse(u.companyId, dto);
  }

  @Get('warehouses/:id')
  getWarehouse(@CurrentUser() u: any, @Param('id') id: string) {
    return this.wms.getWarehouse(id, u.companyId);
  }


  // ── Zones & Bins ───────────────────────────────────────────────────────
  @Roles(...WMS_STRUCTURE_ROLES)
  @Post('warehouses/:id/zones')
  createZone(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: any) {
    return this.wms.createZone(id, u.companyId, dto);
  }

  @Roles(...WMS_STRUCTURE_ROLES)
  @Post('zones/:zoneId/bins')
  createBin(@CurrentUser() u: any, @Param('zoneId') zoneId: string, @Body() dto: any) {
    return this.wms.createBin(zoneId, u.companyId, dto);
  }

  @Roles(...WMS_STRUCTURE_ROLES)
  @Post('zones/:zoneId/bins/bulk')
  bulkCreateBins(@CurrentUser() u: any, @Param('zoneId') zoneId: string, @Body() dto: any) {
    return this.wms.bulkCreateBins(zoneId, u.companyId, dto);
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

  @Roles(...WMS_OPERATION_ROLES)
  @Post('inventory/adjust')
  adjustStock(@CurrentUser() u: any, @Body() dto: any) {
    return this.wms.adjustStock(u.companyId, { ...dto, performedBy: u.id });
  }

  @Roles(...WMS_OPERATION_ROLES)
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
  @Roles(...WMS_OPERATION_ROLES)
  @Post('receipts')
  createReceipt(@CurrentUser() u: any, @Body() dto: any) {
    return this.wms.createGoodsReceipt(u.companyId, dto.warehouseId, dto);
  }

  @Roles(...WMS_OPERATION_ROLES)
  @Post('receipts/:id/receive')
  receiveGoods(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: any) {
    return this.wms.receiveGoods(id, u.companyId, { ...dto, receivedBy: u.id });
  }


  // ── Pick Orders ────────────────────────────────────────────────────────
  @Roles(...WMS_OPERATION_ROLES)
  @Post('picks')
  createPickOrder(@CurrentUser() u: any, @Body() dto: any) {
    return this.wms.createPickOrder(u.companyId, dto.warehouseId, dto);
  }

  @Roles(...WMS_OPERATION_ROLES)
  @Patch('picks/:id/assign')
  assignPicker(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: any) {
    return this.wms.assignPicker(id, u.companyId, dto.userId || u.id);
  }

  @Roles(...WMS_OPERATION_ROLES)
  @Post('picks/:id/confirm')
  confirmPick(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: any) {
    return this.wms.confirmPick(id, u.companyId, dto);
  }

  // ── Cycle Counts ───────────────────────────────────────────────────────
  @Roles(...WMS_OPERATION_ROLES)
  @Post('counts')
  createCycleCount(@CurrentUser() u: any, @Body() dto: any) {
    return this.wms.createCycleCount(u.companyId, dto.warehouseId, dto);
  }

  @Roles(...WMS_OPERATION_ROLES)
  @Post('counts/:id/submit')
  submitCount(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: any) {
    return this.wms.submitCycleCount(id, u.companyId, dto);
  }

  @Roles(...WMS_STRUCTURE_ROLES)
  @Post('counts/:id/approve')
  approveCount(@CurrentUser() u: any, @Param('id') id: string) {
    return this.wms.approveCycleCount(id, u.companyId, u.id);
  }

  // ── Stock Movements ────────────────────────────────────────────────────
  @Get('movements')
  getMovements(@CurrentUser() u: any, @Query() filters: any) {
    return this.wms.getMovementHistory(u.companyId, filters);
  }

  // ── Cross-docking ─────────────────────────────────────────────────────────

  @Roles(...WMS_OPERATION_ROLES)
  @Post('cross-dock')
  @ApiOperation({ summary: 'Cross-dock: bypass storage — inbound goes direct to outbound destinations' })
  createCrossDock(@CurrentUser() u: any, @Body() dto: any) {
    return this.wms.createCrossDock(u.companyId, dto);
  }

  // ── Wave Planning ─────────────────────────────────────────────────────────

  @Roles(...WMS_OPERATION_ROLES)
  @Post('waves')
  @ApiOperation({ summary: 'Create a pick wave — groups pending orders into efficient picker routes by zone' })
  createWave(@CurrentUser() u: any, @Body() dto: any) {
    return this.wms.createWave(u.companyId, dto?.warehouseId, dto);
  }

  // ── Slotting analysis (rule-based ABC, not machine learning) ─────────────

  @Get('slotting/:warehouseId')
  @ApiOperation({ summary: 'Slotting analysis — rule-based velocity (ABC) classification + relocation recommendations' })
  getSlotting(@CurrentUser() u: any, @Param('warehouseId') warehouseId: string) {
    return this.wms.aiSlottingOptimization(u.companyId, warehouseId);
  }

  // ── Barcode/QR Scan Verification ──────────────────────────────────────────

  @Roles(...WMS_OPERATION_ROLES)
  @Post('scan/verify')
  @ApiOperation({ summary: 'Verify a barcode/QR scan — matches SKU, bin, GR, or pick order with context validation' })
  verifyScan(@CurrentUser() u: any, @Body() dto: any) {
    return this.wms.verifyScan(u.companyId, dto);
  }
}
