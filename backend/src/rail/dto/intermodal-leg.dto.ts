import { IsString, IsOptional, IsInt, IsEnum, IsDateString, Min } from 'class-validator';
import { IntermodalLegMode, IntermodalLegStatus } from '@prisma/client';

export class CreateIntermodalLegDto {
  @IsInt() @Min(1)
  sequence!: number;

  @IsEnum(IntermodalLegMode)
  mode!: IntermodalLegMode;

  @IsOptional() @IsEnum(IntermodalLegStatus)
  status?: IntermodalLegStatus;

  @IsOptional() @IsString()
  fromLocation?: string;

  @IsOptional() @IsString()
  toLocation?: string;

  @IsOptional() @IsString()
  handler?: string;

  @IsOptional() @IsDateString()
  plannedStart?: string;

  @IsOptional() @IsDateString()
  plannedEnd?: string;

  @IsOptional() @IsString()
  note?: string;
}

export class AdvanceStatusDto {
  @IsString()
  status!: string;

  @IsOptional() @IsString()
  note?: string;

  @IsOptional() @IsString()
  location?: string;
}

/**
 * Readiness approval for a custody handover on an intermodal leg. The approval
 * is recorded against the exact evidence snapshot it was granted for, so any
 * later change to the evidence invalidates it (and the handover is refused
 * until readiness is re-approved).
 */
export class ApproveHandoffReadinessDto {
  @IsOptional() @IsString()
  note?: string;
}
