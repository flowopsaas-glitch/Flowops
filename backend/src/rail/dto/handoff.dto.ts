import { HandoffEvidenceType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateHandoffReadinessDto {
  @IsOptional()
  @IsString()
  legId?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class AddHandoffEvidenceDto {
  @IsEnum(HandoffEvidenceType)
  type!: HandoffEvidenceType;

  @IsOptional()
  @IsString()
  waybillId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  metadataJson?: string;
}

export class VerifyHandoffEvidenceDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string;
}
