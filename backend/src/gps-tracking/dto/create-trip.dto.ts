import { IsString, IsOptional, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class TripStopDto {
  @IsString()
  location: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsOptional()
  @IsString()
  plannedArrival?: string;

  @IsOptional()
  @IsString()
  plannedDeparture?: string;
}

export class CreateTripDto {
  @IsNumber()
  driverId: number;

  @IsOptional()
  @IsNumber()
  vehicleId?: number;

  @IsOptional()
  @IsNumber()
  manifestId?: number;

  @IsOptional()
  @IsString()
  startLocation?: string;

  @IsOptional()
  @IsString()
  endLocation?: string;

  @IsOptional()
  @IsNumber()
  startLatitude?: number;

  @IsOptional()
  @IsNumber()
  startLongitude?: number;

  @IsOptional()
  @IsNumber()
  endLatitude?: number;

  @IsOptional()
  @IsNumber()
  endLongitude?: number;

  @IsOptional()
  @IsNumber()
  plannedDistance?: number;

  @IsOptional()
  @IsNumber()
  plannedDuration?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripStopDto)
  stops?: TripStopDto[];
}
