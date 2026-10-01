import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, MinLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/user.decorator';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ProductMasterService } from './product-master.service';

const ALIAS_TYPES = ['BARCODE', 'SUPPLIER_CODE', 'CUSTOMER_CODE', 'INTERNAL', 'LEGACY'];

class CreateProductBody {
  @ApiProperty({ example: 'PROD-001' })
  @IsString() @MinLength(1) @MaxLength(80)
  code: string;

  @ApiProperty({ example: 'Cold-chain vaccine pack' })
  @IsString() @MinLength(1) @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) subCategory?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) brand?: string;
  @ApiPropertyOptional({ example: 'EA' }) @IsOptional() @IsString() @MaxLength(16) unitOfMeasure?: string;
  @ApiPropertyOptional() @IsOptional() weightKg?: number;
  @ApiPropertyOptional() @IsOptional() volumeCbm?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) dimensions?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isHazardous?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) hazardousClass?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresBatchTracking?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresSerialTracking?: boolean;
}

class UpdateProductBody extends CreateProductBody {
  @ApiPropertyOptional({ description: 'Optimistic concurrency guard — the revision you read' })
  @IsOptional() @IsInt() @Min(1)
  revision?: number;
}

class CreateVariantBody {
  @ApiProperty({ example: 'PROD-001-RED-L' })
  @IsString() @MinLength(1) @MaxLength(120)
  code: string;

  @ApiProperty({ example: 'Vaccine pack, red, large' })
  @IsString() @MinLength(1) @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(4000)
  description?: string;

  @ApiProperty({
    example: { colour: 'Red', size: 'L' },
    description: 'Defining attributes — normalised into a dedupe fingerprint',
  })
  @IsObject()
  attributes: Record<string, unknown>;

  @ApiPropertyOptional() @IsOptional() weightKg?: number;
  @ApiPropertyOptional() @IsOptional() volumeCbm?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) dimensions?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() reorderPoint?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() reorderQuantity?: number;
}

class UpdateVariantBody {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() attributes?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() weightKg?: number;
  @ApiPropertyOptional() @IsOptional() volumeCbm?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) dimensions?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() reorderPoint?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() reorderQuantity?: number;

  @ApiPropertyOptional({ description: 'Optimistic concurrency guard — the revision you read' })
  @IsOptional() @IsInt() @Min(1)
  revision?: number;
}

class ApproveBody {
  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  approve?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(2000)
  note?: string;
}

class CreateAliasBody {
  @ApiProperty({ enum: ALIAS_TYPES })
  @IsIn(ALIAS_TYPES)
  type: string;

  @ApiProperty({ example: '8901234567890' })
  @IsString() @MinLength(1) @MaxLength(160)
  value: string;

  @ApiPropertyOptional() @IsOptional() @IsString() productId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() variantId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) supplierRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) customerRef?: string;
}

/**
 * Product / Variant / SKU master data API.
 *
 * Tenant-scoped from the token; nothing here accepts a companyId from the body.
 */
const PRODUCT_MASTER_ROLES = [UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER] as const;

@ApiTags('Product Master')
@ApiBearerAuth()
@Controller('product-master')
export class ProductMasterController {
  constructor(private readonly products: ProductMasterService) {}

  @Get('enabled')
  getEnabled() {
    return { enabled: this.products.isEnabled() };
  }

  // ── Products ──────────────────────────────────────────────────────────────

  @Get('products')
  @ApiOperation({ summary: 'List products with their variants' })
  listProducts(
    @CurrentUser() u: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.products.listProducts(u.companyId, { status, search });
  }

  @Roles(...PRODUCT_MASTER_ROLES)
  @Post('products')
  createProduct(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateProductBody) {
    return this.products.createProduct(u.companyId, actorOf(u), dto);
  }

  @Get('products/:id')
  getProduct(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.products.getProduct(u.companyId, id);
  }

  @Roles(...PRODUCT_MASTER_ROLES)
  @Patch('products/:id')
  updateProduct(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductBody,
  ) {
    return this.products.updateProduct(u.companyId, actorOf(u), id, dto);
  }

  @Roles(...PRODUCT_MASTER_ROLES)
  @Post('products/:id/submit')
  submitProduct(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.products.submitProduct(u.companyId, actorOf(u), id);
  }

  @Roles(...PRODUCT_MASTER_ROLES)
  @Post('products/:id/approval')
  @ApiOperation({ summary: 'Approve or reject a product (approval role required)' })
  approveProduct(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApproveBody,
  ) {
    return this.products.approveProduct(u.companyId, actorOf(u), id, dto.approve !== false, dto.note);
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  @Get('variants')
  listVariants(
    @CurrentUser() u: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('productId') productId?: string,
  ) {
    return this.products.listVariants(u.companyId, { status, productId });
  }

  @Roles(...PRODUCT_MASTER_ROLES)
  @Post('products/:id/variants')
  createVariant(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateVariantBody,
  ) {
    return this.products.createVariant(u.companyId, actorOf(u), id, dto);
  }

  @Roles(...PRODUCT_MASTER_ROLES)
  @Patch('variants/:variantId')
  updateVariant(
    @CurrentUser() u: AuthenticatedUser,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantBody,
  ) {
    return this.products.updateVariant(u.companyId, actorOf(u), variantId, dto);
  }

  @Roles(...PRODUCT_MASTER_ROLES)
  @Post('variants/:variantId/approval')
  approveVariant(
    @CurrentUser() u: AuthenticatedUser,
    @Param('variantId') variantId: string,
    @Body() dto: ApproveBody,
  ) {
    return this.products.approveVariant(u.companyId, actorOf(u), variantId, dto.approve !== false, dto.note);
  }

  @Roles(...PRODUCT_MASTER_ROLES)
  @Post('variants/:variantId/sku')
  @ApiOperation({ summary: 'Allocate the next tenant SKU (never reused)' })
  allocateSku(@CurrentUser() u: AuthenticatedUser, @Param('variantId') variantId: string) {
    return this.products.allocateSku(u.companyId, actorOf(u), variantId);
  }

  // ── Aliases ───────────────────────────────────────────────────────────────

  @Roles(...PRODUCT_MASTER_ROLES)
  @Post('aliases')
  addAlias(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateAliasBody) {
    return this.products.addAlias(u.companyId, actorOf(u), dto);
  }

  @Roles(...PRODUCT_MASTER_ROLES)
  @Put('aliases/:aliasId/deactivate')
  removeAlias(@CurrentUser() u: AuthenticatedUser, @Param('aliasId') aliasId: string) {
    return this.products.removeAlias(u.companyId, actorOf(u), aliasId);
  }

  @Get('aliases/resolve')
  @ApiOperation({ summary: 'Resolve a scanned/imported code to governed master data' })
  resolveAlias(
    @CurrentUser() u: AuthenticatedUser,
    @Query('type') type: string,
    @Query('value') value: string,
  ) {
    return this.products.resolveAlias(u.companyId, type, value);
  }

  // ── Audit ─────────────────────────────────────────────────────────────────

  @Get('audit')
  listAudit(
    @CurrentUser() u: AuthenticatedUser,
    @Query('productId') productId?: string,
    @Query('variantId') variantId?: string,
  ) {
    return this.products.listAuditEvents(u.companyId, { productId, variantId });
  }
}

function actorOf(u: AuthenticatedUser) {
  return {
    userId: u?.id ?? null,
    name: u?.name ?? null,
    role: (u?.role as string) ?? null,
    permissions: (u?.permissions ?? null) as Record<string, boolean> | null,
  };
}
