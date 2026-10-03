import {
  IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min,
} from 'class-validator';
import {
  DeviationCategory, ResponsibleParty, SlotImpact,
} from '@prisma/client';
import { RawBoolean } from '../../common/decorators/raw-string.decorator';

/**
 * DTOs for the Daily Handshake (Transnet Network Statement — Annexure 28).
 * TOC-side reconciliation of deviations with the Infrastructure Manager (IM).
 */

export class CreateHandshakeReportDto {
  /** The operating day this report reconciles (defaults to "yesterday" if omitted). */
  @IsOptional() @IsDateString()
  reportDate?: string;

  /** IM/TOC counterparty (e.g. TRIM). */
  @IsOptional() @IsString() @MaxLength(120)
  railOperator?: string;

  @IsOptional() @IsString() @MaxLength(120)
  corridor?: string;

  @IsOptional() @IsString() @MaxLength(120)
  imReference?: string;

  @IsOptional() @IsString() @MaxLength(4000)
  notes?: string;
}

export class UpdateHandshakeReportDto {
  @IsOptional() @IsString() @MaxLength(120)
  railOperator?: string;

  @IsOptional() @IsString() @MaxLength(120)
  corridor?: string;

  @IsOptional() @IsString() @MaxLength(120)
  imReference?: string;

  @IsOptional() @IsString() @MaxLength(4000)
  notes?: string;
}

export class LogDeviationDto {
  /** Every deviation must link to a Train/Slot reference (Annexure 28). */
  @IsString() @MaxLength(120)
  trainSlotRef!: string;

  @IsOptional() @IsString() @MaxLength(120)
  orderNumber?: string;

  /** Optional link to a RailConsignment we already track. */
  @IsOptional() @IsString()
  consignmentId?: string;

  @IsOptional() @IsEnum(DeviationCategory)
  category?: DeviationCategory;

  @IsString() @MaxLength(4000)
  reason!: string;

  @IsOptional() @IsString() @MaxLength(4000)
  rootCause?: string;

  @IsOptional() @IsString() @MaxLength(200)
  location?: string;

  @IsOptional() @IsDateString()
  occurredAt?: string;

  @IsOptional() @IsInt() @Min(0)
  delayMinutes?: number;

  @IsOptional() @IsEnum(ResponsibleParty)
  responsibleParty?: ResponsibleParty;

  @IsOptional() @IsEnum(SlotImpact)
  slotImpact?: SlotImpact;

  @IsOptional() @IsNumber() @Min(0)
  costZar?: number;
}

export class UpdateDeviationDto {
  @IsOptional() @IsEnum(DeviationCategory)
  category?: DeviationCategory;

  @IsOptional() @IsString() @MaxLength(4000)
  reason?: string;

  @IsOptional() @IsString() @MaxLength(4000)
  rootCause?: string;

  @IsOptional() @IsString() @MaxLength(200)
  location?: string;

  @IsOptional() @IsDateString()
  occurredAt?: string;

  @IsOptional() @IsInt() @Min(0)
  delayMinutes?: number;

  @IsOptional() @IsEnum(ResponsibleParty)
  responsibleParty?: ResponsibleParty;

  @IsOptional() @IsEnum(SlotImpact)
  slotImpact?: SlotImpact;

  @IsOptional() @IsNumber() @Min(0)
  costZar?: number;

  @RawBoolean() @IsOptional() @IsBoolean()
  costRecovered?: boolean;
}

/** TOC review of a deviation line: agree, or flag as an OPEN (disputed) item. */
export class ReviewDeviationDto {
  /** true = agree (AGREED); false = disagree → OPEN with a reason. */
  @RawBoolean() @IsBoolean()
  agree!: boolean;

  @IsOptional() @IsString() @MaxLength(4000)
  disputeReason?: string;
}

export class ResolveDeviationDto {
  @IsOptional() @IsString() @MaxLength(4000)
  resolutionNote?: string;

  /** Optional final responsible-party agreed at resolution. */
  @IsOptional() @IsEnum(ResponsibleParty)
  responsibleParty?: ResponsibleParty;

  @RawBoolean() @IsOptional() @IsBoolean()
  costRecovered?: boolean;
}

export class SignOffReportDto {
  /**
   * What the signer types (name / role). The server appends the identity it
   * verified from the JWT — see RailHandshakeService.buildVerifiedSignatory().
   */
  @IsString() @IsNotEmpty() @MaxLength(160)
  signedOffBy!: string;
}
