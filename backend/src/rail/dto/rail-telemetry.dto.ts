import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { RailDeviceKind, RailDeviceStatus } from '@prisma/client';
import { RawBoolean, RawString } from '../../common/decorators/raw-string.decorator';

const CODE = /^[A-Z0-9][A-Z0-9-_]{1,60}$/;

export class CreateTelemetryDeviceDto {
  @RawString() @IsString() @Matches(CODE, { message: 'deviceCode must look like WT-000123 (uppercase letters, digits, - or _)' })
  deviceCode!: string;

  @IsOptional() @IsEnum(RailDeviceKind)
  kind?: RailDeviceKind;

  @RawString() @IsOptional() @IsString() @MaxLength(120)
  label?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(60)
  wagonNumber?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(60)
  locoReference?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(60)
  simRef?: string;

  @IsOptional() @IsNumber()
  speedLimitKph?: number;

  @IsOptional() @IsNumber()
  batteryThresholdPct?: number;

  @RawString() @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;
}

export class UpdateTelemetryDeviceDto {
  @IsOptional() @IsEnum(RailDeviceStatus)
  status?: RailDeviceStatus;

  @RawString() @IsOptional() @IsString() @MaxLength(120)
  label?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(60)
  wagonNumber?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(60)
  locoReference?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(60)
  simRef?: string;

  @IsOptional() @IsNumber()
  speedLimitKph?: number;

  @IsOptional() @IsNumber()
  batteryThresholdPct?: number;

  @RawString() @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;
}

export class TelemetryPointDto {
  @IsOptional() @IsDateString()
  recordedAt?: string;

  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsOptional() @IsNumber()
  speedKph?: number;

  @IsOptional() @IsNumber()
  headingDeg?: number;

  @IsOptional() @IsNumber()
  odometerKm?: number;

  @IsOptional() @IsNumber()
  batteryPct?: number;

  @IsOptional() @IsNumber()
  temperatureC?: number;

  @IsOptional() @RawBoolean() @IsBoolean()
  doorOpen?: boolean;
}

export class DeviceIngestDto {
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => TelemetryPointDto)
  points!: TelemetryPointDto[];
}

export class BulkIngestPointDto extends TelemetryPointDto {
  @RawString() @IsString() @Matches(CODE)
  deviceCode!: string;
}

export class BulkIngestDto {
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => BulkIngestPointDto)
  points!: BulkIngestPointDto[];
}

export class AlertActionDto {
  @RawString() @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class TelemetryQueryDto {
  @IsOptional() @IsDateString()
  from?: string;

  @IsOptional() @IsDateString()
  to?: string;

  @IsOptional() @IsInt() @Min(1) @Max(2000)
  limit?: number;
}
