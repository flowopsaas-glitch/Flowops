import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { JourneyStageType, JourneyStatus, JourneyUpdateType } from '@prisma/client';

/**
 * Journey transport DTOs.
 *
 * Every body reaching a Journey endpoint is validated here rather than being
 * trusted at the call site, so the `@Body()` ratchet stays at zero. The enum
 * fields are the Prisma enums themselves: a value outside the union is
 * rejected before it can reach the service, which matters most on the driver
 * surface where a client could otherwise invent a `type`.
 */

export class CreateJourneyDto {
  /** Human reference for the journey, e.g. a load or trip number. Required. */
  @IsString()
  @MaxLength(120)
  reference: string;

  @IsOptional()
  @IsString()
  driverId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  origin?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  destination?: string | null;

  @IsOptional()
  @IsDateString()
  plannedStart?: string | null;

  @IsOptional()
  @IsDateString()
  plannedEnd?: string | null;
}

export class AddStageDto {
  /** Position of the stage within the journey. 1-based. */
  @IsInt()
  @Min(1)
  stageNumber: number;

  @IsEnum(JourneyStageType)
  type: JourneyStageType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  locationName?: string | null;
}

export class AssignDriverDto {
  @IsString()
  driverId: string;
}

export class UpdateJourneyStatusDto {
  @IsEnum(JourneyStatus)
  status: JourneyStatus;
}

export class SendJourneyUpdateDto {
  @IsEnum(JourneyUpdateType)
  type: JourneyUpdateType;

  @IsString()
  @MaxLength(4000)
  message: string;

  /**
   * Client-generated idempotency key. A retry carrying the same key returns
   * the original update instead of creating a second one; the database unique
   * index is the concurrency barrier, not an application-level check.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  clientMessageId?: string;

  /**
   * When the driver's device claims the event happened. Kept separate from the
   * server-observed time so a device clock that is wrong cannot silently
   * rewrite the timeline — provenance is preserved, never collapsed.
   */
  @IsOptional()
  @IsDateString()
  deviceOccurredAt?: string | null;

  @IsOptional()
  @IsString()
  stageId?: string | null;
}

export class ResolveJourneyUpdateDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string | null;
}
