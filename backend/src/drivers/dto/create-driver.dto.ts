import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';

export class CreateDriverDto {
  @IsString() name: string;
  @IsString() phone: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() vehicleType?: string;
  @IsOptional() @IsString() vehicleReg?: string;
  @IsOptional() @IsString() licenseNumber?: string;
  @IsOptional() @IsString() idNumber?: string;
  @IsOptional() @IsString() pin?: string;
}

export class UpdateDriverDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() vehicleType?: string;
  @IsOptional() @IsString() vehicleReg?: string;
  @IsOptional() @IsString() licenseNumber?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() pin?: string;
}

export class UpdateDriverLocationDto {
  @IsNumber() lat: number;
  @IsNumber() lng: number;
  @IsOptional() @IsNumber() speed?: number;
  @IsOptional() @IsNumber() heading?: number;
}
