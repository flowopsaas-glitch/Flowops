import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { RailGauge, RailVehicleProfile, WagonType } from '@prisma/client';
import { RawBoolean, RawString } from '../../common/decorators/raw-string.decorator';

/**
 * Digital Train Manifest DTOs. A DRAFT manifest's header and wagon lines are
 * editable; issuing is a signatory attestation that freezes the document.
 */

const CODE = /^[A-Z0-9-]{2,40}$/;

export class ManifestWagonLineDto {
  @IsInt() @Min(0)
  position!: number;

  @RawString() @IsString() @MaxLength(60)
  wagonNumber!: string;

  @IsOptional() @IsEnum(WagonType)
  type?: WagonType;

  @IsOptional()
  tareTonnes?: number;

  @IsOptional()
  loadedTonnes?: number;

  @RawString() @IsOptional() @IsString() @MaxLength(120)
  commodity?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(200)
  sealNumbers?: string;

  @IsOptional() @IsInt() @Min(2) @Max(32)
  axles?: number;

  @IsOptional() @IsEnum(RailGauge)
  gauge?: RailGauge;

  @IsOptional() @IsEnum(RailVehicleProfile)
  vehicleProfile?: RailVehicleProfile;

  @IsOptional() @RawBoolean() @IsBoolean()
  isDangerousGoods?: boolean;

  @RawString() @IsOptional() @IsString() @MaxLength(20)
  unNumber?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(20)
  imdgClass?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(60)
  placardRef?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(60)
  emergencyContact24h?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(500)
  msdsDocumentUrl?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class CreateTrainManifestDto {
  @RawString() @IsString() @MaxLength(60)
  consignmentId!: string;

  @RawString() @IsOptional() @IsString() @MaxLength(60)
  slotApplicationId?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(120)
  trainServiceRef?: string;

  @RawString() @IsOptional() @IsString() @Matches(CODE, { message: 'corridor must look like COR-ORE or a route label' })
  corridor?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(160)
  originSiding?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(160)
  destinationSiding?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(120)
  railOperator?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(60)
  locoReference?: string;

  @IsOptional() @IsDateString()
  plannedDeparture?: string;

  @IsOptional() @IsDateString()
  plannedArrival?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;
}

export class UpdateTrainManifestDto {
  @RawString() @IsOptional() @IsString() @MaxLength(120)
  trainServiceRef?: string;

  @RawString() @IsOptional() @IsString() @Matches(CODE, { message: 'corridor must look like COR-ORE or a route label' })
  corridor?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(160)
  originSiding?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(160)
  destinationSiding?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(120)
  railOperator?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(60)
  locoReference?: string;

  @IsOptional() @IsDateString()
  plannedDeparture?: string;

  @IsOptional() @IsDateString()
  plannedArrival?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ManifestWagonLineDto)
  wagons?: ManifestWagonLineDto[];
}

export class IssueTrainManifestDto {
  /** The signatory's typed name/role — bound to the server-verified identity. */
  @RawString() @IsString() @MaxLength(160)
  issuedBy!: string;
}

export class AmendTrainManifestDto {
  @RawString() @IsOptional() @IsString() @MaxLength(2000)
  note?: string;
}

export class CancelTrainManifestDto {
  @RawString() @IsString() @MinLength(3) @MaxLength(2000)
  reason!: string;
}

export class ManifestMoveDto {
  @RawString() @IsOptional() @IsString() @MaxLength(160)
  signedBy?: string;

  @IsOptional() @IsDateString()
  at?: string;
}
