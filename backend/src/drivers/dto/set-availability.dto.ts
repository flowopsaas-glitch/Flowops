import { IsEnum, IsOptional, IsString } from "class-validator";
type DriverAvailability = any;

export class SetAvailabilityDto {
  
  availabilityStatus!: DriverAvailability;

  @IsOptional()
  @IsString()
  zone?: string;
}