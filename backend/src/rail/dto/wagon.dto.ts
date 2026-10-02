import { IsString, IsOptional, IsNumber, IsEnum, IsInt, Min, Max } from 'class-validator';
import { RailGauge, RailVehicleProfile, WagonType } from '@prisma/client';

export class CreateWagonDto {
  @IsString()
  wagonNumber!: string;

  @IsOptional() @IsEnum(WagonType)
  type?: WagonType;

  @IsOptional() @IsNumber()
  tareTonnes?: number;

  @IsOptional() @IsNumber()
  loadedTonnes?: number;

  @IsOptional() @IsString()
  commodity?: string;

  @IsOptional() @IsString()
  sealNumbers?: string;

  @IsOptional() @IsString()
  lastKnownSiding?: string;
  /** Axle count (1–12). With tare + loaded weight it gives the axle load the corridor-envelope check uses. */
  @IsOptional() @IsInt() @Min(1) @Max(12)
  axles?: number;

  @IsOptional() @IsEnum(RailGauge)
  gauge?: RailGauge;

  @IsOptional() @IsEnum(RailVehicleProfile)
  vehicleProfile?: RailVehicleProfile;
}
