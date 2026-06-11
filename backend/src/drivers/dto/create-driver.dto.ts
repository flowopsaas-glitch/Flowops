import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class CreateDriverDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  zone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  homeBase?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  vehicleType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  vehicleReg?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxActiveDispatches?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  availabilityStatus?: "AVAILABLE" | "BUSY" | "OFFLINE" | "ON_LEAVE";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  trackingProvider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  trackingAccountRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  trackingPortalUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  trackingPhone?: string;

  @IsOptional()
  @IsBoolean()
  trackingEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  trackingStatus?: string;

  @IsOptional()
  @IsString()
  trackingLastSyncAt?: string;

  @IsOptional()
  @IsString()
  lastPingAt?: string;
}