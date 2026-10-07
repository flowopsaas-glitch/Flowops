import {
  IsString, IsOptional, IsNumber, IsInt, IsEnum, IsDateString, IsBoolean, Matches, MaxLength, Min,
} from 'class-validator';
import { RiskLevel } from '@prisma/client';
import { RawBoolean, RawString } from '../../common/decorators/raw-string.decorator';

export class CreateRailConsignmentDto {
  @IsString()
  commodity!: string;

  @IsOptional() @IsString()
  clientName?: string;

  @IsOptional() @IsNumber()
  tonnage?: number;

  @IsOptional() @IsInt() @Min(0)
  wagonsPlanned?: number;

  @IsOptional() @IsString()
  corridor?: string;

  @IsOptional() @IsString()
  originSiding?: string;

  @IsOptional() @IsString()
  destinationSiding?: string;

  @IsOptional() @IsString()
  railOperator?: string;

  @IsOptional() @IsString()
  serviceRef?: string;

  @IsOptional() @IsString()
  interchangePoint?: string;

  @IsOptional() @IsDateString()
  plannedDeparture?: string;

  @IsOptional() @IsDateString()
  plannedArrival?: string;

  @IsOptional() @IsInt() @Min(0)
  slaHours?: number;

  @IsOptional() @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;

  @IsOptional() @IsString()
  riskNote?: string;
  // ── Dangerous goods (Wave 3) ───────────────────────────────────────────────
  @RawBoolean() @IsOptional() @IsBoolean()
  isDangerousGoods?: boolean;

  /** "UN1203" — "1203" and "un 1203" are accepted and normalised. */
  @RawString() @IsOptional() @IsString() @Matches(/^(UN\s?)?\d{4}$/i, { message: 'unNumber must be UN followed by four digits' })
  unNumber?: string;

  /** IMDG class, e.g. 3, 2.1, 6.1, 1.4S. */
  @RawString() @IsOptional() @IsString() @Matches(/^[1-9](\.[1-6])?[A-Za-z]?$/, { message: 'imdgClass must be an IMDG class such as 3, 2.1 or 1.4S' })
  imdgClass?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(60)
  placardRef?: string;

  @RawString() @IsOptional() @IsString() @Matches(/^\+?\(?[0-9][0-9 ()-]{5,18}[0-9]$/, { message: 'emergencyContact24h must be a phone number' })
  emergencyContact24h?: string;

  /** Link to the controlled safety data sheet — never the file itself. */
  @RawString() @IsOptional() @IsString() @Matches(/^https:\/\/\S+$/, { message: 'msdsDocumentUrl must be an https:// link' }) @MaxLength(500)
  msdsDocumentUrl?: string;

  @IsOptional()
  @IsString({ each: true })
  waybillIds?: string[];
}
