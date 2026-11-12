import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const INCIDENT_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const INCIDENT_STATUSES = [
  'REPORTED', 'CORROBORATED', 'VERIFIED', 'REJECTED', 'WITHDRAWN',
] as const;
export const DOCUMENT_TYPES = [
  'HS_ORIGIN', 'CERTIFICATE_OF_ORIGIN', 'DUTY_ESTIMATE', 'DUTY_ACTUAL',
  'DECLARATION', 'OTHER',
] as const;
export const ORIGIN_STATUSES = ['PREFERENTIAL', 'NON_PREFERENTIAL', 'UNKNOWN'] as const;

/**
 * Report and document bodies.
 *
 * A driver reporting an incident may set what happened and where. They may not
 * set who verified it, how many drivers were warned, or the status: those are
 * the outcome of review, and letting a caller assert them would make the
 * verification trail decoration rather than evidence.
 */

export class ReportIncidentDto {
  @IsString() @MaxLength(80) type: string;

  @IsEnum(INCIDENT_SEVERITIES as unknown as string[]) severity: string;

  @IsNumber({ maxDecimalPlaces: 8 }) @Min(-90) @Max(90) reportLat: number;

  @IsNumber({ maxDecimalPlaces: 8 }) @Min(-180) @Max(180) reportLng: number;

  @IsOptional() @IsString() @MaxLength(32) locationSource?: string;

  @IsOptional() @IsString() @MaxLength(2000) narrative?: string;

  @IsOptional() @IsString() @MaxLength(64) zoneId?: string;
}

export class CreateTripDocumentDto {
  @IsString() @MaxLength(64) tripId: string;

  @IsEnum(DOCUMENT_TYPES as unknown as string[]) documentType: string;

  @IsOptional() @IsString() @MaxLength(120) documentRef?: string;

  @IsOptional() @IsString() @MaxLength(32) hsCode?: string;

  @IsOptional() @IsEnum(ORIGIN_STATUSES as unknown as string[]) originStatus?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) dutyEstimated?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) dutyActual?: number;

  @IsOptional() @IsString() @MaxLength(120) declarationRef?: string;
}
