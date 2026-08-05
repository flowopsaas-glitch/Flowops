import { IsString, IsOptional, IsNumber, IsArray, IsDateString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class StopDto {
  @ApiProperty() @IsString() waybillId: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() lat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() lng?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() scheduledTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() serviceTime?: number; // minutes
}

export class CreateRoutePlanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() driverId?: string;

  @ApiProperty({ type: [StopDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StopDto)
  stops: StopDto[];

  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() vehicleCapacity?: number;
}

export class UpdateRoutePlanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() driverId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;

  @ApiPropertyOptional({ type: [StopDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StopDto)
  stops?: StopDto[];
}
