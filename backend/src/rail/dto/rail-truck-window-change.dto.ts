import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { RawString } from '../../common/decorators/raw-string.decorator';

/**
 * Publish a new window version for a truck appointment.
 *
 * `reason` is REQUIRED by the cut-off rule when the change lands inside the
 * per-company gate cut-off, and optional otherwise — but it is always recorded,
 * because the recipient view shows it and a change with no stated reason is a
 * phone call waiting to happen.
 */
export class ChangeTruckWindowDto {
  @IsDateString() windowStart!: string;
  @IsDateString() windowEnd!: string;
  /** Why the window moved. Becomes the recorded reason on the change event. */
  @RawString() @IsOptional() @IsString() @MaxLength(1000) reason?: string;
  /** Required with `reason` when inside the change cut-off. */
  @IsOptional() @IsBoolean() force?: boolean;
  /**
   * Duplicate-submit guard. A replayed key returns the ORIGINAL change instead
   * of publishing a second version — a double-tapped "Publish" on a bad
   * connection must not produce two superseding windows and two notification
   * storms.
   */
  @RawString() @IsOptional() @IsString() @MaxLength(120) idempotencyKey?: string;
}

/**
 * Acknowledge a window change. Deliberately tiny: the act being recorded is
 * "a human saw the new window and confirmed it", and every field here is
 * evidence about THAT act, not free-form commentary.
 */
export class AckTruckWindowDto {
  /**
   * Client-reported time of the confirmation, for an ack queued offline and
   * flushed later. Stored separately from the server-observed `ackedAt` and
   * labelled device-reported wherever shown — it is never used for measurement,
   * because a device clock is not evidence.
   */
  @IsOptional() @IsDateString() deviceAckedAt?: string;
  /** Replay guard for an offline outbox flush. */
  @RawString() @IsOptional() @IsString() @MaxLength(120) idempotencyKey?: string;
}

/** Per-terminal acknowledgement thresholds (the escalation ladder's clock). */
export class UpdateGateAckPolicyDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(1440) ackDueMinutes!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(1440) reminderAfterMinutes!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(10080) escalateAfterMinutes!: number;
}

/** Assign the driver who will actually run the gate window. */
export class AssignTruckDriverDto {
  /** Driver id in THIS tenant. A driver from another company is a 404, not a 403. */
  @RawString() @IsString() @MinLength(1) @MaxLength(60) driverId!: string;
}
