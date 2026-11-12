import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Rate-card bodies.
 *
 * The service already allowlists with `pickAllowed(dto, RATE_CARD_FIELDS)`, so
 * this module was not mass-assignable. What it lacked was any bound on the
 * numbers, and `calculate` in particular is a pricing function: an unbounded
 * `weight` and an unbounded `basePrice` are how a quote goes wrong.
 *
 * `calculate`'s weight guard was fixed in the service after a bug where an
 * undefined weight reached Prisma as `lte: undefined` — which Prisma drops,
 * turning the filter into "every active card" and pricing the job off whichever
 * row came back first. The `@Min`/`@Max` here are the second lock on that door.
 */

export class CreateRateCardDto {
  @IsString() @MaxLength(120) name: string;

  @IsOptional() @IsString() @MaxLength(64) fromZone?: string;

  @IsOptional() @IsString() @MaxLength(64) toZone?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1_000_000) minWeight?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1_000_000) maxWeight?: number;

  @Type(() => Number) @IsNumber() @Min(0) @Max(100_000_000) basePrice: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1_000_000) pricePerKg?: number;

  /** ISO 4217. */
  @IsOptional() @IsString() @MaxLength(3) currency?: string;

  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateRateCardDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;

  @IsOptional() @IsString() @MaxLength(64) fromZone?: string;

  @IsOptional() @IsString() @MaxLength(64) toZone?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1_000_000) minWeight?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1_000_000) maxWeight?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100_000_000) basePrice?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1_000_000) pricePerKg?: number;

  @IsOptional() @IsString() @MaxLength(3) currency?: string;

  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CalculateRateDto {
  /**
   * Required, and bounded. This is the value that used to reach Prisma as
   * `undefined`, silently widening the filter to every active card.
   */
  @Type(() => Number) @IsNumber() @Min(0) @Max(1_000_000) weight: number;

  @IsOptional() @IsString() @MaxLength(64) fromZone?: string;

  @IsOptional() @IsString() @MaxLength(64) toZone?: string;
}
