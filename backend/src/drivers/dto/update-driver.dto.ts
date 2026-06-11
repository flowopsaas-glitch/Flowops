import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from "class-validator";
type DriverAvailability = any;

export class UpdateDriverDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  zone?: string;

  @IsOptional()
  @IsString()
  homeBase?: string;

  @IsOptional()
  @IsString()
  vehicleType?: string;

  @IsOptional()
  @IsString()
  vehicleReg?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxActiveDispatches?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  
  availabilityStatus?: DriverAvailability;

  @IsOptional()
  @IsString()
  notes?: string;
}