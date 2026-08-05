import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartTrackingDto {
  @ApiProperty() @IsString() driverId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() manifestId?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() totalStops?: number;
}

export class UpdateLocationDto {
  @ApiProperty() @IsNumber() lat: number;
  @ApiProperty() @IsNumber() lng: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() speed?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() heading?: number;
}

export class StopCompletedDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() distanceCovered?: number;
}
