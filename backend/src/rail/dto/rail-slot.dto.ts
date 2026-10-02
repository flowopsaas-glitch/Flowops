import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional,
  IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { RailComplianceDocType, RailElectrification, RailGauge, RailVehicleProfile } from '@prisma/client';
import { RawBoolean, RawString } from '../../common/decorators/raw-string.decorator';

/**
 * DTOs for slot applications, Annexure 25 self-screening, compliance documents and the
 * corridor-envelope check. Every free-text field uses @RawString() so an object sent in place
 * of a string is rejected rather than coerced to "[object Object]" by the global pipe's
 * implicit conversion (see backend/src/common/decorators/raw-string.decorator.ts).
 */

const CODE = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;

export class CreateSlotApplicationDto {
  /** Corridor catalog code, e.g. COR-ORE. */
  @RawString() @IsString() @Matches(CODE, { message: 'corridorCode must look like COR-ORE' }) @MaxLength(40)
  corridorCode!: string;

  @RawString() @IsOptional() @IsString() @MaxLength(200) originName?: string;
  @RawString() @IsOptional() @IsString() @MaxLength(200) destinationName?: string;
  @RawString() @IsOptional() @IsString() @Matches(CODE) @MaxLength(40) originYardCode?: string;
  @RawString() @IsOptional() @IsString() @Matches(CODE) @MaxLength(40) destinationYardCode?: string;
  @RawString() @IsOptional() @IsString() @MaxLength(120) railOperator?: string;
  @RawString() @IsOptional() @IsString() @MaxLength(120) imReference?: string;
  @IsOptional() @IsEnum(RailElectrification) tractionType?: RailElectrification;
  @RawString() @IsOptional() @IsString() @MaxLength(120) commodity?: string;
  @RawBoolean() @IsOptional() @IsBoolean() isDangerousGoods?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(1000) trainsPerWeek?: number;
  @IsOptional() @IsInt() @Min(1) @Max(500) wagonsPerTrain?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000_000) annualTonnes?: number;

  // rolling-stock particulars for the corridor-envelope check
  @IsOptional() @IsEnum(RailGauge) gauge?: RailGauge;
  @IsOptional() @IsNumber() @Min(0.1) @Max(40) axleLoadTonnes?: number;
  @IsOptional() @IsEnum(RailVehicleProfile) vehicleProfile?: RailVehicleProfile;
  @IsOptional() @IsInt() @Min(1) @Max(5000) trainLengthM?: number;

  /** Requested validity window (at most 5 years — enforced in the service). */
  @IsDateString() requestedFrom!: string;
  @IsDateString() requestedUntil!: string;
}

export class UpdateSlotApplicationDto extends PartialType(CreateSlotApplicationDto) {}

export class SelfScreeningAnswerDto {
  /** Roman numeral as printed on Annexure 25: i … vii. */
  @RawString() @IsString() @IsIn(['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii']) no!: string;
  @IsIn(['YES', 'NO']) answer!: 'YES' | 'NO';
  @RawString() @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
}

export class SelfScreeningDto {
  @IsOptional() @IsIn(['Network A', 'Network B']) accessType?: 'Network A' | 'Network B';
  @IsArray() @ArrayMaxSize(7) @ValidateNested({ each: true }) @Type(() => SelfScreeningAnswerDto)
  answers!: SelfScreeningAnswerDto[];
}

export class ConflictDto {
  @RawString() @IsString() @MinLength(3) @MaxLength(2000) note!: string;
}

export class RejectApplicationDto {
  @RawString() @IsString() @MinLength(3) @MaxLength(2000) reason!: string;
}

export class AllocateApplicationDto {
  /** When the IM allocated it. Defaults to now. Starts the 60-day mobilisation clock. */
  @IsOptional() @IsDateString() allocatedAt?: string;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @RawString() @IsOptional() @IsString() @MaxLength(120) imReference?: string;
}

export class MarkOperatedDto {
  @IsOptional() @IsDateString() operatedAt?: string;
  @RawString() @IsOptional() @IsString() @MaxLength(60) consignmentId?: string;
}

export class LinkConsignmentDto {
  @RawString() @IsString() @IsNotEmpty() @MaxLength(60) consignmentId!: string;
}

export class EnvelopeSubjectDto {
  @RawString() @IsOptional() @IsString() @MaxLength(80) label?: string;
  @IsOptional() @IsEnum(RailGauge) gauge?: RailGauge;
  @IsOptional() @IsNumber() @Min(0) @Max(40) axleLoadTonnes?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(500) tareTonnes?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(500) loadedTonnes?: number;
  @IsOptional() @IsInt() @Min(1) @Max(12) axles?: number;
  @IsOptional() @IsEnum(RailVehicleProfile) vehicleProfile?: RailVehicleProfile;
  @IsOptional() @IsInt() @Min(1) @Max(5000) trainLengthM?: number;
  @IsOptional() @IsEnum(RailElectrification) tractionType?: RailElectrification;
}

/** Check manual rolling-stock particulars, or a tenant consignment's wagons, against a corridor. */
export class EnvelopeCheckDto {
  @RawString() @IsOptional() @IsString() @Matches(CODE) @MaxLength(40) corridorCode?: string;
  @RawString() @IsOptional() @IsString() @MaxLength(60) consignmentId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => EnvelopeSubjectDto)
  subjects?: EnvelopeSubjectDto[];
}

export class CreateComplianceDocDto {
  @IsEnum(RailComplianceDocType) docType!: RailComplianceDocType;
  @RawString() @IsOptional() @IsString() @MaxLength(120) referenceNumber?: string;
  @RawString() @IsOptional() @IsString() @MaxLength(160) issuer?: string;
  @IsDateString() validFrom!: string;
  @IsDateString() validUntil!: string;
  /** Pointer to controlled storage — the document itself is never stored here. */
  @RawString() @IsOptional() @IsString() @Matches(/^https:\/\//, { message: 'documentUrl must be an https:// link' }) @MaxLength(500)
  documentUrl?: string;
  @RawString() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class RevokeComplianceDocDto {
  @RawString() @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}
