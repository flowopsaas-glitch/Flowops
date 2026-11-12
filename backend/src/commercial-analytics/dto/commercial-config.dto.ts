import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * Commercial cost-model configuration.
 *
 * The service wraps this in `withCompanyId`, which strips companyId / id /
 * createdAt / updatedAt and pins the tenant — so scoping is handled. What was
 * not: every number here feeds margin and forecast maths, and none of them had
 * a bound. A negative `targetMarginPct` or a `fuelCostPerKm` of 1e300 does not
 * fail, it just quietly produces a nonsense profitability dashboard, which is
 * the more dangerous outcome.
 */

export class UpdateCommercialConfigDto {
  /** ZAR per km. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1000) fuelCostPerKm?: number;

  /** ZAR per hour. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(10_000) driverHourlyCost?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1000) vehicleCostPerKm?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1_000_000) overheadPerDelivery?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(10_000) avgDeliveryMinutes?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100_000) avgKmPerDelivery?: number;

  /** Percentages. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-100) @Max(1000) targetMarginPct?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-100) @Max(1000) minMarginPct?: number;

  @IsOptional() @IsBoolean() seasonalityEnabled?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60) forecastMonths?: number;
}
