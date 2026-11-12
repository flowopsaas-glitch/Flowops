import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Border dwell bodies.
 *
 * A dwell session is the time a driver spends inside a border geofence. It is
 * the evidence behind a BORDER trip leg (see trip-leg.service), so the whole
 * point of it is that it is measured from GPS rather than typed in by a human:
 * the ingest route is the only path that may set timings, and it derives them
 * from the fixes it receives.
 *
 * `IngestFixDto` deliberately has no fields for enteredAt, exitedAt, state or
 * sampleCount. Those are outputs of the state machine, not inputs to it — a
 * caller who could set them could manufacture crossing evidence.
 */

export class IngestFixDto {
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(-180)
  @Max(180)
  lng: number;

  /**
   * The driver the fix belongs to. Optional: a driver calling on their own
   * behalf is resolved from the session, and may not name anyone else — the
   * same rule `resolveSubjectDriver` applies to safety zones, for the same
   * reason. A session records who was at the border.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  driverId?: string;

  /** When the fix was taken. Defaults to now, so replay cannot be silent. */
  @IsOptional()
  @IsDateString()
  at?: string;

  /** Number of fixes this one stands in for (batched upload from a device). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  samples?: number;
}

export class ListSessionsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  state?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;
}
