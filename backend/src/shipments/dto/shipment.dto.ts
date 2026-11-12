import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Shipment bodies.
 *
 * Both `create` and `update` already funnel input through
 * `pickAllowed(dto, SHIPMENT_FIELDS)`, and `update` is tenant-scoped before it
 * writes — so this was not a mass-assignment hole. What it was: `lat`/`lng`
 * with no range (a shipment could be placed at 900, 900), a `status` with no
 * membership check (Prisma enum violation = 500, not 400), and dates accepted
 * as free text.
 *
 * `recalculateRisk` reads only `waybillId`. Left untyped, an empty body made
 * that `undefined`, and Prisma drops an undefined filter — so
 * `findFirst({ id: undefined, companyId })` returned the company's FIRST
 * waybill and the risk score was written to whatever row that happened to be.
 * The service now requires it explicitly; the DTO is the second lock.
 */

export const SHIPMENT_STATUSES = ['PENDING', 'IN_TRANSIT', 'DELIVERED', 'FAILED'] as const;

export class CreateShipmentDto {
  @IsString() @MaxLength(64) waybillId: string;

  @IsOptional() @IsEnum(SHIPMENT_STATUSES as unknown as string[]) status?: string;

  @IsOptional() @IsString() @MaxLength(64) driverId?: string;

  @IsOptional() @IsString() @MaxLength(64) userId?: string;

  /** Valid ranges — a shipment at lat 900 is a data bug, not a location. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) currentLat?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) currentLng?: number;

  @IsOptional() @IsDateString() estimatedDelivery?: string;

  @IsOptional() @IsDateString() deliveredAt?: string;
}

export class UpdateShipmentDto {
  /**
   * Optional here: a PATCH that only reassigns a driver must not have to restate
   * the waybill. `create` requires it because a shipment cannot exist without
   * one.
   */
  @IsOptional() @IsString() @MaxLength(64) waybillId?: string;

  @IsOptional() @IsEnum(SHIPMENT_STATUSES as unknown as string[]) status?: string;

  @IsOptional() @IsString() @MaxLength(64) driverId?: string;

  @IsOptional() @IsString() @MaxLength(64) userId?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) currentLat?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) currentLng?: number;

  @IsOptional() @IsDateString() estimatedDelivery?: string;

  @IsOptional() @IsDateString() deliveredAt?: string;
}

export class RecalculateRiskDto {
  @IsString() @MaxLength(64) waybillId: string;
}
