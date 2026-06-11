import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SuggestQuoteDto {
  @IsOptional() @IsInt() @Min(1)
  rateCardId?: number;

  @IsNumber() @Min(0)
  distanceKm!: number;

  @IsNumber() @Min(0)
  weightKg!: number;

  @IsOptional() @IsNumber() @Min(0)
  volumeCm3?: number;

  @IsOptional() @IsInt() @Min(1)
  parcelsCount?: number;

  @IsOptional() @IsBoolean()
  isRemoteArea?: boolean;

  @IsOptional() @IsBoolean()
  isAfterHours?: boolean;

  @IsOptional() @IsString()
  fromLabel?: string;

  @IsOptional() @IsString()
  toLabel?: string;
}