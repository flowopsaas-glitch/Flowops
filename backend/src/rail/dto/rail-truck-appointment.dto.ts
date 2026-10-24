import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { RawString } from '../../common/decorators/raw-string.decorator';

export class BookTruckAppointmentDto {
  @RawString() @IsString() @MinLength(1) @MaxLength(120) terminalName!: string;
  @RawString() @IsString() @MinLength(1) @MaxLength(120) haulierName!: string;
  @RawString() @IsString() @MinLength(1) @MaxLength(30) vehicleReg!: string;
  @RawString() @IsOptional() @IsString() @MaxLength(80) driverName?: string;
  @IsOptional() @IsIn(['DELIVERY', 'COLLECTION']) purpose?: string;
  @IsDateString() windowStart!: string;
  @IsDateString() windowEnd!: string;
  @RawString() @IsOptional() @IsString() @MaxLength(60) consignmentId?: string;
  @RawString() @IsOptional() @IsString() @MaxLength(60) legId?: string;
  @RawString() @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class TruckAppointmentTransitionDto {
  @RawString() @IsOptional() @IsString() @MaxLength(1000) note?: string;
  /** New window when rescheduling a BOOKED appointment. */
  @IsOptional() @IsDateString() windowStart?: string;
  @IsOptional() @IsDateString() windowEnd?: string;
}
