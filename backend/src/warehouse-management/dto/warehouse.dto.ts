import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Payload types for the warehouse (WMS) module.
 *
 * Sixteen endpoints took `@Body() dto: any` here, the largest concentration in
 * the codebase. With an untyped body the global ValidationPipe has no metatype,
 * `whitelist: true` strips nothing, and the raw JSON reaches the service —
 * where three of these write it straight into Prisma:
 *
 *     createZone:   data: { warehouseId: wh.id, ...dto }
 *     createBin:    data: { zoneId, ...dto }
 *     createGoodsReceipt: lines: { create: dto.lines }
 *
 * The first two let a caller set `id` or `companyId` on a zone/bin. The third
 * is worse: `dto.lines` is a nested create, so each line object is also raw and
 * can carry `id`, `companyId` or `goodsReceiptId`. createPickOrder has the same
 * shape via `{ ...line, suggestedBinId }`.
 *
 * Two things here are not just allowlisting:
 *
 *   bulkCreateBins  builds `levels x positions` bins in a nested loop with no
 *                   cap. 100000 x 100000 is a million inserts from one request.
 *                   Bounded here.
 *
 *   adjustStock     `quantity` is a DELTA, not an absolute: the service does
 *                   `quantityOnHand + dto.quantity` and refuses the result if
 *                   it goes below zero. A `@Min(0)` here would break every
 *                   stock reduction in the module, so it is deliberately absent
 *                   — the service owns that rule.
 */

// ── Warehouses, zones, bins ───────────────────────────────────────────────────

export class CreateWarehouseDto {
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(32) code?: string;
  @IsOptional() @IsString() @MaxLength(64) branchId?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) lat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) lng?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) totalAreaSqm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) usableAreaSqm?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) maxPalletCapacity?: number;
  @IsOptional() @IsString() @MaxLength(10) operatingHoursStart?: string;
  @IsOptional() @IsString() @MaxLength(10) operatingHoursEnd?: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
}

export class CreateZoneDto {
  @IsString() @MaxLength(200) name: string;
  @IsString() @MaxLength(32) code: string;
  @IsOptional() @IsString() @MaxLength(32) type?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) areaSqm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() temperature?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxWeight?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;

  // `warehouseId` is taken from the URL, and `id` / `companyId` are absent:
  // the service does `data: { warehouseId: wh.id, ...dto }`.
}

export class CreateBinDto {
  @IsString() @MaxLength(64) code: string;
  @IsOptional() @IsString() @MaxLength(16) aisle?: string;
  @IsOptional() @IsString() @MaxLength(16) rack?: string;
  @IsOptional() @IsString() @MaxLength(16) level?: string;
  @IsOptional() @IsString() @MaxLength(16) position?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxWeightKg?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxVolumeCbm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) widthCm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) heightCm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) depthCm?: number;
  @IsOptional() @IsBoolean() isEmpty?: boolean;
  @IsOptional() @IsBoolean() isBlocked?: boolean;
  @IsOptional() @IsString() @MaxLength(200) blockReason?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) pickSequence?: number;

  // `zoneId` comes from the URL. The service does `data: { zoneId, ...dto }`.
}

/**
 * The loop bounds are the point of this DTO.
 *
 * The service runs `for level in 1..levels { for pos in 1..positions { ... } }`
 * and inserts a bin per iteration. Unbounded, a single request decides how many
 * rows the database writes — 50 x 500 is already 25,000, which is far beyond
 * any real rack and still finishes quickly.
 */
export class BulkCreateBinsDto {
  @IsString() @MaxLength(16) aisle: string;
  @IsString() @MaxLength(16) rack: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(50) levels: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(500) positions: number;

  @IsOptional() @IsString() @MaxLength(32) binType?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxWeightKg?: number;
}

// ── Stock ────────────────────────────────────────────────────────────────────

export class AdjustStockDto {
  @IsString() @MaxLength(64) binId: string;
  @IsString() @MaxLength(128) sku: string;

  /**
   * A DELTA, not an absolute. The service computes
   * `quantityOnHand + dto.quantity` and refuses a negative result, so a
   * `@Min(0)` here would break every legitimate stock reduction. The service
   * owns that rule; this only insists it is a finite number.
   */
  @Type(() => Number) @IsNumber() @Min(-1_000_000) @Max(1_000_000) quantity: number;

  @IsString() @MaxLength(200) reason: string;
  @IsOptional() @IsString() @MaxLength(120) performedBy?: string;
}

export class TransferStockDto {
  @IsString() @MaxLength(128) sku: string;
  @Type(() => Number) @IsNumber() @Min(0) @Max(1_000_000) quantity: number;
  @IsString() @MaxLength(64) fromBinId: string;
  @IsString() @MaxLength(64) toBinId: string;
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
  @IsOptional() @IsString() @MaxLength(120) performedBy?: string;
}

// ── Goods receipts ───────────────────────────────────────────────────────────

export class GoodsReceiptLineDto {
  @IsString() @MaxLength(128) sku: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) expectedQty: number;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

export class CreateGoodsReceiptDto {
  // Read off the body by the controller (createGoodsReceipt takes it as its own
  // argument), so it has to be declared here or the whitelist eats it.
  @IsString() @MaxLength(64) warehouseId: string;

  @IsOptional() @IsString() @MaxLength(64) poNumber?: string;
  @IsOptional() @IsString() @MaxLength(200) supplierName?: string;
  @IsOptional() @IsString() @MaxLength(200) carrierName?: string;
  @IsOptional() @IsDateString() expectedDate?: string;

  // The service does `lines: { create: dto.lines }` — a nested create from raw
  // JSON. Validating each line is what stops `id` / `companyId` /
  // `goodsReceiptId` riding in on one.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  lines?: GoodsReceiptLineDto[];
}

export class ReceivedLineDto {
  @IsString() @MaxLength(128) sku: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) receivedQty: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) damagedQty?: number;
  @IsOptional() @IsString() @MaxLength(64) batchNumber?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsString() @MaxLength(64) putAwayBinId?: string;
}

export class ReceiveGoodsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceivedLineDto)
  lines: ReceivedLineDto[];

  @IsOptional() @IsString() @MaxLength(120) receivedBy?: string;
}

// ── Pick orders ──────────────────────────────────────────────────────────────

export class PickOrderLineDto {
  @IsString() @MaxLength(128) sku: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) requestedQty: number;
}

export class CreatePickOrderDto {
  @IsString() @MaxLength(64) warehouseId: string;

  @IsOptional() @IsString() @MaxLength(32) sourceType?: string;
  @IsOptional() @IsString() @MaxLength(64) sourceId?: string;
  @IsOptional() @IsString() @MaxLength(200) clientName?: string;
  @IsOptional() @IsString() @MaxLength(200) shipToName?: string;
  @IsOptional() @IsString() @MaxLength(500) shipToAddress?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) priority?: number;

  // The service spreads each line (`{ ...line, suggestedBinId }`) into a nested
  // create, so these are validated too.
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PickOrderLineDto)
  lines: PickOrderLineDto[];
}

export class AssignPickerDto {
  @IsString() @MaxLength(64) userId: string;
}

export class PickConfirmLineDto {
  @IsString() @MaxLength(128) sku: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) pickedQty: number;
  @IsString() @MaxLength(64) actualBinId: string;
  @IsOptional() @IsString() @MaxLength(120) pickedBy?: string;
}

export class ConfirmPickDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PickConfirmLineDto)
  lines: PickConfirmLineDto[];
}

// ── Cycle counts ─────────────────────────────────────────────────────────────

export class CreateCycleCountDto {
  @IsString() @MaxLength(64) warehouseId: string;

  @IsOptional() @IsIn(['FULL', 'ABC', 'ZONE', 'SKU', 'RANDOM']) countType?: string;
  @IsOptional() @IsDateString() scheduledDate?: string;
  @IsOptional() @IsString() @MaxLength(200) zoneFilter?: string;
  @IsOptional() @IsString() @MaxLength(200) skuFilter?: string;
}

export class CountedLineDto {
  @IsString() @MaxLength(64) binCode: string;
  @IsString() @MaxLength(128) sku: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) countedQty: number;
}

export class SubmitCycleCountDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CountedLineDto)
  lines: CountedLineDto[];

  @IsOptional() @IsString() @MaxLength(120) completedBy?: string;
}

// ── Cross-dock, waves, scanning ──────────────────────────────────────────────

export class CrossDockLineDto {
  @IsString() @MaxLength(128) sku: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) quantity: number;
  @IsString() @MaxLength(200) destinationClient: string;
  @IsOptional() @IsString() @MaxLength(500) destinationAddress?: string;
}

export class CreateCrossDockDto {
  @IsString() @MaxLength(64) warehouseId: string;
  @IsOptional() @IsString() @MaxLength(200) supplierName?: string;
  @IsOptional() @IsString() @MaxLength(64) inboundRef?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CrossDockLineDto)
  lines: CrossDockLineDto[];
}

export class CreateWaveDto {
  // The controller reads `dto?.warehouseId`, so declaring it is what keeps it.
  @IsOptional() @IsString() @MaxLength(64) warehouseId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) maxOrders?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5000) maxLines?: number;

  // The service runs `parseInt(dto.priority)`, so this is a string on the wire.
  @IsOptional() @IsString() @MaxLength(16) priority?: string;

  @IsOptional() @IsString() @MaxLength(200) zoneFilter?: string;
}

export type ScanContext = 'RECEIVE' | 'PICK' | 'PUT_AWAY' | 'TRANSFER' | 'CYCLE_COUNT';

export const SCAN_CONTEXTS: ScanContext[] = [
  'RECEIVE', 'PICK', 'PUT_AWAY', 'TRANSFER', 'CYCLE_COUNT',
];

export class VerifyScanDto {
  @IsString() @MaxLength(200) barcode: string;

  // Typed as the literal union, not `string`: the service narrows on it, and a
  // plain string would widen the parameter type and stop it compiling.
  @IsIn(SCAN_CONTEXTS) context: ScanContext;
  @IsOptional() @IsString() @MaxLength(128) expectedSku?: string;
  @IsOptional() @IsString() @MaxLength(64) expectedBin?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) expectedQuantity?: number;
}
