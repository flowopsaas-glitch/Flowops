import { TripCostType } from '@prisma/client';
import {
  IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min,
} from 'class-validator';

/**
 * A measured operating cost (fuel, toll, other) captured against a driver
 * and — when known — the exact waybill or manifest that caused it.
 * Amounts are what was actually paid; nothing here is estimated.
 */
export class CreateTripCostDto {
  @IsEnum(TripCostType)
  type: TripCostType;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  driverId: string;

  @IsOptional()
  @IsString()
  waybillId?: string;

  @IsOptional()
  @IsString()
  manifestId?: string;

  /** Fuel only; stripped server-side for other types. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  litres?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  odometerKm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
