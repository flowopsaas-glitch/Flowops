import { IsArray, IsOptional, IsString, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class DepotDto {
  @ApiProperty() @IsNumber() lat: number;
  @ApiProperty() @IsNumber() lng: number;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
}

export class CreateRouteOptimizationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  deliveryIds: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  vehicleIds: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => DepotDto)
  depot?: DepotDto;
}

export class AllocateDeliveryDto {
  @ApiProperty() @IsString() waybillId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() driverId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() sequence?: number;
}
