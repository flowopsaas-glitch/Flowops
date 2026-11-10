import { IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { GeneralAverageSecurity, GeneralAverageStatus, GeneralAverageValueBasis } from '@prisma/client';

/**
 * Payload types for the General Average module.
 *
 * These are validated DTO classes rather than `@Body() body: any`. That is
 * deliberate and it is the lesson from waybills and companies: with an untyped
 * body the global ValidationPipe has no metatype, `whitelist: true` has nothing
 * to whitelist against, and the raw JSON reaches the service — where a spread
 * into a Prisma write let a caller set fields they do not own.
 *
 * Money is not silently trustable here. A wrong contributory value changes
 * what a cargo interest owes.
 */

export class CreateGaEventDto {
  @IsString() vesselName: string;
  @IsString() nature: string;
  @IsDateString() occurredAt: string;

  @IsOptional() @IsString() vesselImo?: string;
  @IsOptional() @IsString() vesselMmsi?: string;
  @IsOptional() @IsString() voyageNumber?: string;
  @IsOptional() @IsString() portOfRefuge?: string;

  @IsOptional() @IsString() declaredBy?: string;
  @IsOptional() @IsDateString() declaredAt?: string;
  @IsOptional() @IsString() adjusterName?: string;
  @IsOptional() @IsString() adjusterRef?: string;

  @IsOptional() @IsNumber() @Min(0) totalExpenditure?: number;
  @IsOptional() @IsNumber() @Min(0) totalSacrifice?: number;
  @IsOptional() @IsString() currency?: string;

  @IsOptional() @IsString() notes?: string;
}

export class UpdateGaEventDto {
  @IsOptional() @IsString() vesselName?: string;
  @IsOptional() @IsString() nature?: string;
  @IsOptional() @IsNumber() @Min(0) totalExpenditure?: number;
  @IsOptional() @IsNumber() @Min(0) totalSacrifice?: number;
  @IsOptional() @IsString() adjusterName?: string;
  @IsOptional() @IsString() adjusterRef?: string;
  @IsOptional() @IsEnum(GeneralAverageStatus) status?: GeneralAverageStatus;
  @IsOptional() @IsString() notes?: string;
}

export class AddContributorDto {
  @IsString() shipmentFileId: string;

  /**
   * The value this cargo interest contributes ON. CIF at the port of
   * destination is the standard basis; `valueBasis` records which was used.
   */
  @IsNumber() @Min(0) contributoryValue: number;

  @IsOptional() @IsEnum(GeneralAverageValueBasis) valueBasis?: GeneralAverageValueBasis;
  @IsOptional() @IsString() notes?: string;
}

export class LodgeSecurityDto {
  @IsEnum(GeneralAverageSecurity) securityType: GeneralAverageSecurity;
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsString() reference?: string;
}

export class AwardContributionDto {
  @IsString() contributorId: string;
  @IsNumber() @Min(0) assessedContribution: number;
  @IsOptional() @IsNumber() @Min(0) adjustedValue?: number;
}

export class RecordAwardDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => AwardContributionDto)
  contributions: AwardContributionDto[];

  @IsOptional() @IsString() adjusterName?: string;
  @IsOptional() @IsString() adjusterRef?: string;
}

export class ReleaseCargoDto {
  /** Advisory: who physically released it. The security check is the gate. */
  @IsOptional() @IsString() note?: string;
}
