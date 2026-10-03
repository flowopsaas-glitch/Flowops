import {
  IsBoolean, IsDateString, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength,
} from 'class-validator';
import { RailChangeInitiator, RailChangeKind } from '@prisma/client';
import { RawBoolean, RawString } from '../../common/decorators/raw-string.decorator';

/**
 * Cancel / reschedule / re-plan (Annexure 20a) with a reason from Annexure 20b.
 * Deliberately NOT accepted from the client: attribution, force-majeure flag, consequence, notice band —
 * they are derived on the server from the reason code, so a request cannot choose its own penalty.
 */
export class CreateChangeRequestDto {
  @IsEnum(RailChangeKind) kind!: RailChangeKind;
  @IsEnum(RailChangeInitiator) initiatedBy!: RailChangeInitiator;

  /** Annexure 20b code, e.g. CNX-071. */
  @RawString() @IsString() @Matches(/^CNX-\d{3}$/, { message: 'cancellationCode must look like CNX-071' })
  cancellationCode!: string;

  @RawString() @IsString() @IsNotEmpty() @MaxLength(120)
  trainSlotRef!: string;

  @RawString() @IsOptional() @IsString() @MaxLength(60) consignmentId?: string;
  @RawString() @IsOptional() @IsString() @MaxLength(60) slotApplicationId?: string;
  /** Log it in this Daily Handshake report as a deviation (the report must be DRAFT or PENDING_TOC). */
  @RawString() @IsOptional() @IsString() @MaxLength(60) handshakeReportId?: string;

  @IsOptional() @IsDateString() originalDeparture?: string;
  @IsOptional() @IsDateString() proposedDeparture?: string;
  /** When the cause happened — starts the 15-minute notice clock. */
  @IsOptional() @IsDateString() eventOccurredAt?: string;

  @RawBoolean() @IsOptional() @IsBoolean() isPlannedOccupation?: boolean;
  @RawBoolean() @IsOptional() @IsBoolean() requiresStaging?: boolean;
  @RawString() @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

/** Same inputs, nothing saved — the modal calls this to show attribution / window / consequence live. */
export class PreviewChangeRequestDto extends CreateChangeRequestDto {}

export class ProposeAlternativeDto {
  @IsDateString() proposedDeparture!: string;
  @RawString() @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class AllocatePartyDto {
  @IsIn(['TRIM', 'TOC', 'FORCE_MAJEURE']) attribution!: 'TRIM' | 'TOC' | 'FORCE_MAJEURE';
  /** Clearinghouse reference / reasoning. */
  @RawString() @IsString() @MinLength(3) @MaxLength(2000) note!: string;
}
