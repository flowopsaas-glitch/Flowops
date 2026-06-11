// src/drivers/dto/create-driver.dto.ts
import { IsString, IsOptional, IsInt } from 'class-validator';

export class CreateDriverDto {
  @IsString()
  userId!: string; // Link to a User profile

  @IsOptional()
  @IsString()
  licenseNo?: string;

  @IsOptional()
  @IsString()
  vehicleType?: string;

  @IsOptional()
  @IsInt()
  capacity?: number;
}