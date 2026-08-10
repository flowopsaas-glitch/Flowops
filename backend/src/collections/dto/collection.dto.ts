import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';

export class CreateCollectionDto {
  @IsString() clientName: string;
  @IsOptional() @IsString() clientPhone?: string;
  @IsOptional() @IsString() clientEmail?: string;
  @IsString() pickupAddress: string;
  @IsOptional() @IsString() deliveryAddress?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsNumber() pieces?: number;
  @IsOptional() @IsString() scheduledDate?: string;
  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) waybillIds?: string[];
}

export class UpdateCollectionDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() scheduledDate?: string;
  @IsOptional() @IsNumber() pieces?: number;
}
