import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';

export class CreateDriverDto {
  @IsString() name: string;
  // Phone is strongly recommended (the driver portal logs in with phone + PIN),
  // but not hard-required at create time — a dispatcher may add a driver before
  // their number is confirmed. The UI flags it as needed for portal login.
  @IsOptional() @IsString() phone?: string;
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
