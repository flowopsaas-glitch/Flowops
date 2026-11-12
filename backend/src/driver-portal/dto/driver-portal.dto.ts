import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Driver-submitted trip costs (fuel, tolls, sundry).
 *
 * The service validates each field itself and throws BadRequest on a bad one, so
 * this was not exploitable — but every check was an `if` after the fact, and the
 * money fields had no upper bound. A driver-submitted cost is reconciled against
 * an invoice, so an unbounded `amount` is worth pinning at the edge.
 */

export const TRIP_COST_TYPES = ['FUEL', 'TOLL', 'OTHER'] as const;

export class LogDriverCostDto {
  @IsEnum(TRIP_COST_TYPES as unknown as string[]) type: string;

  /** Positive; the service rejects zero and non-finite. Bounded as well. */
  @Type(() => Number) @IsNumber() @Min(0.01) @Max(1_000_000) amount: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(10_000) litres?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000_000) odometerKm?: number;

  /**
   * Tenant- and ownership-checked by the service: it only accepts a waybill
   * assigned to this driver.
   */
  @IsOptional() @IsString() @MaxLength(64) waybillId?: string;

  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
