import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

/**
 * OKR request bodies. Platform-level (the controller is behind OwnerAuthGuard
 * and these rows carry no companyId), so the risk here is not cross-tenant
 * leakage — it is malformed writes.
 *
 * Both `status` fields reach Prisma through an `as any` cast and an
 * unconditional assign, so an unrecognised value was a 500 (Prisma enum
 * violation) rather than a 400. `@IsEnum` moves that to the edge.
 */

export const OKR_STATUSES = ['ON_TRACK', 'AT_RISK', 'BEHIND', 'ACHIEVED', 'CANCELLED'] as const;
export const KEY_RESULT_UNITS = ['NUMBER', 'PERCENT', 'CURRENCY'] as const;

export class CreateObjectiveDto {
  @IsString() @MaxLength(300) title: string;

  @IsOptional() @IsString() @MaxLength(4000) description?: string;

  /** e.g. "2026-Q4". Constrained so the quarter index stays queryable. */
  @Matches(/^\d{4}-Q[1-4]$/) quarter: string;

  @IsOptional() @IsString() @MaxLength(120) owner?: string;

  @IsOptional() @IsEnum(OKR_STATUSES as unknown as string[]) status?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000) sortOrder?: number;
}

export class UpdateObjectiveDto {
  @IsOptional() @IsString() @MaxLength(300) title?: string;

  @IsOptional() @IsString() @MaxLength(4000) description?: string;

  @IsOptional() @Matches(/^\d{4}-Q[1-4]$/) quarter?: string;

  @IsOptional() @IsString() @MaxLength(120) owner?: string;

  /**
   * Not `@IsOptional()`-only: an explicit null/undefined is how a caller leaves
   * status alone, and the service already distinguishes the two.
   */
  @IsOptional() @IsEnum(OKR_STATUSES as unknown as string[]) status?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000) sortOrder?: number;
}

export class AddKeyResultDto {
  @IsString() @MaxLength(300) title: string;

  @IsOptional() @IsEnum(KEY_RESULT_UNITS as unknown as string[]) unit?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-1e12) @Max(1e12) startValue?: number;

  /**
   * Required by the service: `currentValue` defaults to it, so without a target
   * the row is meaningless.
   */
  @Type(() => Number) @IsNumber() @Min(-1e12) @Max(1e12) targetValue: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-1e12) @Max(1e12) currentValue?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000) sortOrder?: number;
}

export class UpdateKeyResultDto {
  @IsOptional() @IsString() @MaxLength(300) title?: string;

  @IsOptional() @IsEnum(KEY_RESULT_UNITS as unknown as string[]) unit?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-1e12) @Max(1e12) startValue?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-1e12) @Max(1e12) targetValue?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-1e12) @Max(1e12) currentValue?: number;

  @IsOptional() @IsEnum(OKR_STATUSES as unknown as string[]) status?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000) sortOrder?: number;
}
