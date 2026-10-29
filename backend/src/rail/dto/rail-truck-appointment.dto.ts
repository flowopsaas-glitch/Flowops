import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { RawString } from '../../common/decorators/raw-string.decorator';

export class BookTruckAppointmentDto {
  @RawString() @IsString() @MinLength(1) @MaxLength(120) terminalName!: string;
  @RawString() @IsString() @MinLength(1) @MaxLength(120) haulierName!: string;
  @RawString() @IsString() @MinLength(1) @MaxLength(30) vehicleReg!: string;
  @RawString() @IsOptional() @IsString() @MaxLength(80) driverName?: string;
  /**
   * Resolved against the calling tenant: a driver id from another company is
   * rejected, and the stored `driverName` comes from the resolved Driver row
   * rather than from a typed label. This link is what makes "notify the
   * assigned driver" a real recipient instead of a guess.
   */
  @RawString() @IsOptional() @IsString() @MaxLength(60) driverId?: string;
  @IsOptional() @IsIn(['DELIVERY', 'COLLECTION']) purpose?: string;
  @IsDateString() windowStart!: string;
  @IsDateString() windowEnd!: string;
  @RawString() @IsOptional() @IsString() @MaxLength(60) consignmentId?: string;
  @RawString() @IsOptional() @IsString() @MaxLength(60) legId?: string;
  @RawString() @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class TruckAppointmentTransitionDto {
  @RawString() @IsOptional() @IsString() @MaxLength(1000) note?: string;
  /** Inside the change cut-off a change must be forced with `note` as the recorded reason. */
  @IsOptional() @IsBoolean() force?: boolean;
  /** New window when rescheduling a BOOKED appointment. */
  @IsOptional() @IsDateString() windowStart?: string;
  @IsOptional() @IsDateString() windowEnd?: string;
}


export class ShiftTruckAppointmentsDto {
  @RawString() @IsString() @MinLength(1) @MaxLength(120) terminalName!: string;
  /** Day to replan, YYYY-MM-DD (windows are matched on their UTC start day). */
  @RawString() @IsString() @MinLength(10) @MaxLength(10) date!: string;
  /** Signed minutes to move every BOOKED window that day (e.g. +120 for a late train). */
  @IsInt() @Min(-720) @Max(720) shiftMinutes!: number;
  @RawString() @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
