import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, Max, MinLength, ValidateNested,
} from 'class-validator';
import { RawBoolean, RawNumber, RawString } from '../../common/decorators/raw-string.decorator';

/** Traction energy for the movement. Quantity and price are the caller's; nothing here is defaulted by the DTO. */
export class TractionDto {
  @IsIn(['DIESEL', 'ELECTRIC']) type!: 'DIESEL' | 'ELECTRIC';
  /** Litres of diesel (DIESEL only). */
  @RawNumber() @IsOptional() @IsNumber() @Min(0.001) @Max(10_000_000) litres?: number;
  /** kWh (ELECTRIC only). */
  @RawNumber() @IsOptional() @IsNumber() @Min(0.001) @Max(1_000_000_000) kWh?: number;
  /** ZAR per litre / per kWh, replacing any loaded or base price. */
  @RawNumber() @IsOptional() @IsNumber() @Min(0.0001) @Max(100_000) pricePerUnitZar?: number;
}

export class AncillaryItemDto {
  @RawString() @IsString() @Matches(/^ANX40-\d{2}(-\d{2})?$/, { message: 'code must be an Annexure 40 line code such as ANX40-04 or ANX40-04-02' }) code!: string;
  @RawNumber() @IsNumber() @Min(0.001) @Max(1_000_000) quantity!: number;
}

export class TariffRequestDto {
  @RawString() @IsString() @MinLength(1) @MaxLength(60) consignmentId!: string;
  /**
   * Kilometres of the movement. REQUIRED: corridor lengths were not supplied, so GTK cannot be worked out without it
   * and the service never guesses one.
   */
  @RawNumber() @IsNumber() @Min(0.1) @Max(10_000) distanceKm!: number;
  /** "2026/27". Defaults to the financial year of the consignment's planned departure. */
  @RawString() @IsOptional() @IsString() @Matches(/^\d{4}\/\d{2}$/, { message: 'financialYear must look like 2026/27' }) financialYear?: string;
  /**
   * The traffic category as the network publishes it — for Transnet, a Table 17 commodity
   * group such as "OreCor (Iron Ore)" or "Grain & Tankers". Transnet charges by commodity,
   * not by corridor, so without this a Transnet consignment usually cannot be priced.
   */
  @RawString() @IsOptional() @IsString() @MaxLength(120) commodityCategory?: string;
  @RawBoolean() @IsOptional() @IsBoolean() includeEmptyReturn?: boolean;
  /** Opt in to escalating the latest earlier VERIFIED year's rates by the brief's percentages. */
  @RawBoolean() @IsOptional() @IsBoolean() allowEscalation?: boolean;
  @IsOptional() @ValidateNested() @Type(() => TractionDto) traction?: TractionDto;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => AncillaryItemDto) ancillary?: AncillaryItemDto[];
}

export class InvoiceDraftDto {
  /** Overrides the consignment's client name. One of the two is required: an invoice cannot be finalised without it. */
  @RawString() @IsOptional() @IsString() @MinLength(1) @MaxLength(200) clientName?: string;
}
