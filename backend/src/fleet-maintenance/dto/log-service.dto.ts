import {
  IsDateString, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min,
} from 'class-validator';

export class LogServiceDto {
  @IsUUID('4') idempotencyKey: string;
  // The service endpoint requires it at the service layer; the legacy nested
  // driver route derives it from the URL and deliberately overwrites this value.
  @IsOptional() @IsString() driverId?: string;
  @IsString() @MaxLength(120) serviceType: string;
  @IsOptional() @IsInt() @Min(0) @Max(2_000_000) kmAtService?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000_000) cost?: number;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsString() @MaxLength(2_000) notes?: string;
  @IsOptional() @IsDateString() servicedAt?: string;
  @IsOptional() @IsString() @MaxLength(200) providerName?: string;
  @IsOptional() @IsString() @MaxLength(120) invoiceRef?: string;
  @IsOptional() @IsString() @MaxLength(1_000) partsReplaced?: string;
  @IsOptional() @IsDateString() warrantyExpiry?: string;
}
