import { IsBoolean, IsDateString, IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { RailOccurrenceLevel, RailOccurrenceType } from '@prisma/client';
import { RawBoolean, RawString } from '../../common/decorators/raw-string.decorator';

export class CreateOccurrenceDto {
  @IsEnum(RailOccurrenceType) type!: RailOccurrenceType;
  @IsEnum(RailOccurrenceLevel) level!: RailOccurrenceLevel;
  @IsDateString() occurredAt!: string;
  @RawString() @IsString() @MinLength(5) @MaxLength(4000) description!: string;
  @RawString() @IsOptional() @IsString() @Matches(/^[A-Z0-9]+(-[A-Z0-9]+)*$/) @MaxLength(40) corridorCode?: string;
  @RawString() @IsOptional() @IsString() @MaxLength(200) location?: string;
  @RawString() @IsOptional() @IsString() @MaxLength(120) trainSlotRef?: string;
  @RawString() @IsOptional() @IsString() @MaxLength(60) consignmentId?: string;
  /** Also log it as a deviation in this Daily Handshake report (DRAFT or PENDING_TOC). */
  @RawString() @IsOptional() @IsString() @MaxLength(60) handshakeReportId?: string;
  @IsOptional() @IsIn(['TRIM', 'TOC', 'FORCE_MAJEURE', 'UNDETERMINED']) responsibleParty?: 'TRIM' | 'TOC' | 'FORCE_MAJEURE' | 'UNDETERMINED';
  @RawBoolean() @IsOptional() @IsBoolean() fatalities?: boolean;
  @RawBoolean() @IsOptional() @IsBoolean() hazmatInvolved?: boolean;
}

export class NotifyOccurrenceDto {
  /** TCO = the IM's Train Control Officer; RSR = the Railway Safety Regulator. */
  @IsIn(['TCO', 'RSR']) to!: 'TCO' | 'RSR';
  @IsOptional() @IsDateString() at?: string;
}

export class OccurrenceNoteDto {
  @RawString() @IsString() @MinLength(3) @MaxLength(4000) note!: string;
}
