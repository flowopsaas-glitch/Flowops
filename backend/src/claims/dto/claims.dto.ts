import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const CLAIM_TYPES = ['DAMAGE', 'LOSS', 'SHORTAGE', 'DELAY', 'THEFT'] as const;
export const CLAIM_STATUSES = ['OPEN', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SETTLED', 'WITHDRAWN'] as const;
export const CLAIM_LIABILITIES = ['UNASSESSED', 'CARRIER', 'INSURER', 'CLIENT', 'THIRD_PARTY'] as const;

/**
 * Raising a claim.
 *
 * `claimedAmount` is required and must be positive: "a claim for nothing" is a
 * complaint, not a claim, and letting it in would put zero-value rows in the
 * financial view. Liability is optional here — a driver can report damage at the
 * gate without knowing the commercial position — but approval will refuse until
 * someone states it.
 */
export class CreateClaimDto {
  @ApiProperty({ description: 'Waybill the claim concerns. Must belong to the caller’s company.' })
  @IsString()
  @MinLength(1)
  waybillId!: string;

  @ApiProperty({ enum: CLAIM_TYPES })
  @IsIn(CLAIM_TYPES as unknown as string[])
  type!: (typeof CLAIM_TYPES)[number];

  @ApiProperty({ example: 4250.0, description: 'Amount claimed, in `currency`. Must be > 0.' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  claimedAmount!: number;

  @ApiProperty({ example: 'Pallet 3 of 7 crushed on unloading' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  summary!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({ description: 'Defaults to the waybill recipient when omitted.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  clientName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  clientEmail?: string;

  @ApiPropertyOptional({ description: 'Invoice to credit at settlement, when known.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  invoiceId?: string;

  @ApiPropertyOptional({ example: '2026-11-02T14:20:00.000Z' })
  @IsOptional()
  @IsISO8601()
  incidentAt?: string;

  @ApiPropertyOptional({ example: 'ZAR', default: 'ZAR' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ enum: CLAIM_LIABILITIES })
  @IsOptional()
  @IsIn(CLAIM_LIABILITIES as unknown as string[])
  liability?: (typeof CLAIM_LIABILITIES)[number];

  @ApiPropertyOptional({ example: 'Trading terms clause 12.2' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  liabilityBasis?: string;

  @ApiPropertyOptional({ description: 'Operator-set cap for this claim. Omit if not stated.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  liabilityCap?: number;

  @ApiPropertyOptional({ description: 'When a response is owed by, e.g. the client’s SLA.' })
  @IsOptional()
  @IsISO8601()
  respondBy?: string;

  @ApiPropertyOptional({ description: 'Evidence references (photo ids, ePOD ids, manifest codes).' })
  @IsOptional()
  @IsObject()
  evidence?: Record<string, unknown>;
}

export class AssessClaimDto {
  @ApiProperty({ enum: CLAIM_LIABILITIES.filter((l) => l !== 'UNASSESSED') })
  @IsIn(CLAIM_LIABILITIES.filter((l) => l !== 'UNASSESSED') as unknown as string[])
  liability!: 'CARRIER' | 'INSURER' | 'CLIENT' | 'THIRD_PARTY';

  @ApiProperty({ example: 'Trading terms clause 12.2 — limit R250 000 per load' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  liabilityBasis!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  liabilityCap?: number;
}

export class ApproveClaimDto {
  @ApiProperty({ example: 3100.0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  approvedAmount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class RejectClaimDto {
  @ApiProperty({ example: 'Damage occurred after signed POD; liability is with the consignee.' })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}

export class WithdrawClaimDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class AddNoteDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  description!: string;
}

export class AddEvidenceDto {
  @ApiProperty({ type: [String], example: ['photo:INV-3312-1', 'epod:epod_99'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  refs!: string[];
}

export class ListClaimsQuery {
  @ApiPropertyOptional({ enum: CLAIM_STATUSES })
  @IsOptional()
  @IsIn(CLAIM_STATUSES as unknown as string[])
  status?: (typeof CLAIM_STATUSES)[number];

  @ApiPropertyOptional({ enum: CLAIM_TYPES })
  @IsOptional()
  @IsIn(CLAIM_TYPES as unknown as string[])
  type?: (typeof CLAIM_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  waybillId?: string;

  @ApiPropertyOptional({ description: 'Only claims still in play (not settled, rejected or withdrawn).' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  openOnly?: boolean;

  @ApiPropertyOptional({ description: 'Free text over number, waybill, client and summary.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ default: 100, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
