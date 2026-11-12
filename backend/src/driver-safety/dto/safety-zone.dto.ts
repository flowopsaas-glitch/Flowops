import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Safety-zone bodies.
 *
 *     createZone: data: { ...dto, companyId }
 *     updateZone: const { companyId, ...rest } = dto; data: { ...rest, companyId }
 *
 * Both spreads re-assert companyId last, so the tenant-rehoming attack the
 * service comment describes is already closed. What the spread still allowed:
 * a caller-set `id`, and `createdAt` / `updatedAt` written verbatim. On create
 * a client-chosen `id` collides with an existing row; on update it is a no-op
 * Prisma ignores, which is worse — it looks harmless and quietly isn't.
 */

export const SAFETY_ZONE_RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export class CreateSafetyZoneDto {
  @IsString() @MaxLength(200) name: string;

  @IsOptional() @IsString() @MaxLength(2000) description?: string;

  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) lat: number;

  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) lng: number;

  /** Metres. A zone wider than a metro area is a mistake, not a geofence. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(100_000) radiusM?: number;

  @IsOptional() @IsEnum(SAFETY_ZONE_RISK_LEVELS as unknown as string[]) riskLevel?: string;

  @IsOptional() @IsString() @MaxLength(500) alertMessage?: string;

  @IsOptional() @IsBoolean() notifyDriver?: boolean;

  @IsOptional() @IsBoolean() notifyDispatch?: boolean;

  @IsOptional() @IsBoolean() notifyAdmin?: boolean;

  /** SAPS_STATS | MANUAL | AI_DETECTED | COMMUNITY */
  @IsOptional() @IsString() @MaxLength(32) source?: string;

  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateSafetyZoneDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;

  @IsOptional() @IsString() @MaxLength(2000) description?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) lat?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) lng?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(100_000) radiusM?: number;

  @IsOptional() @IsEnum(SAFETY_ZONE_RISK_LEVELS as unknown as string[]) riskLevel?: string;

  @IsOptional() @IsString() @MaxLength(500) alertMessage?: string;

  @IsOptional() @IsBoolean() notifyDriver?: boolean;

  @IsOptional() @IsBoolean() notifyDispatch?: boolean;

  @IsOptional() @IsBoolean() notifyAdmin?: boolean;

  @IsOptional() @IsString() @MaxLength(32) source?: string;

  @IsOptional() @IsBoolean() isActive?: boolean;
}
