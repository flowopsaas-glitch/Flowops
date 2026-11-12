import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Carrier bodies.
 *
 * `create` and `addRate` already build their Prisma calls field by field, so
 * they were never mass-assignable. `update` was:
 *
 *     const { id, companyId, rates, ...data } = dto ?? {};
 *     prisma.carrier.update({ where: { id }, data });
 *
 * That strips three keys and writes every other one — so `createdAt`,
 * `updatedAt`, and any column added to `Carrier` later were all caller-settable.
 * `UpdateCarrierDto` is the allowlist that closes it.
 */

export const CARRIER_TYPES = [
  'OCEAN_LINE',
  'AIRLINE',
  'ROAD_CARRIER',
  'COURIER',
  'CUSTOMS_BROKER',
  'OTHER',
] as const;

export class CreateCarrierDto {
  @IsString() @MaxLength(200) name: string;

  @IsOptional() @IsEnum(CARRIER_TYPES as unknown as string[]) type?: string;

  @IsOptional() @IsString() @MaxLength(32) code?: string;

  @IsOptional() @IsString() @MaxLength(120) contactName?: string;

  @IsOptional() @IsEmail() @MaxLength(200) contactEmail?: string;

  @IsOptional() @IsString() @MaxLength(40) contactPhone?: string;

  @IsOptional() @IsString() @MaxLength(64) accountNumber?: string;

  @IsOptional() @IsString() @MaxLength(4000) notes?: string;

  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateCarrierDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;

  @IsOptional() @IsEnum(CARRIER_TYPES as unknown as string[]) type?: string;

  @IsOptional() @IsString() @MaxLength(32) code?: string;

  @IsOptional() @IsString() @MaxLength(120) contactName?: string;

  @IsOptional() @IsEmail() @MaxLength(200) contactEmail?: string;

  @IsOptional() @IsString() @MaxLength(40) contactPhone?: string;

  @IsOptional() @IsString() @MaxLength(64) accountNumber?: string;

  @IsOptional() @IsString() @MaxLength(4000) notes?: string;

  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AddCarrierRateDto {
  /**
   * The service re-checks this with `toRate`, which also accepts a numeric
   * string. Typed as a number here so `@Type` coerces it before that check
   * sees it, and so a non-numeric string is a 400 rather than a coerced 0.
   */
  @Type(() => Number) @IsNumber() @Min(0) @Max(100_000_000) buyRate: number;

  @IsOptional() @IsString() @MaxLength(120) lane?: string;

  /** OCEAN | AIR | ROAD. Kept open: carriers invent their own modes. */
  @IsOptional() @IsString() @MaxLength(24) mode?: string;

  @IsOptional() @IsString() @MaxLength(24) containerType?: string;

  @IsOptional() @IsString() @MaxLength(3) currency?: string;

  @IsOptional() @IsDateString() validFrom?: string;

  @IsOptional() @IsDateString() validTo?: string;
}
