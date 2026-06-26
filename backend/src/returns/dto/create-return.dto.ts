import {
  IsArray, IsEmail, IsEnum, IsNumber, IsOptional, IsString, Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ReturnReason, ReturnResolution, ReturnStatus, ReturnCondition,
} from '@prisma/client';

export class ReturnItemDto {
  @ApiProperty({ example: 'Nike Air Zoom — size 9' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ example: 'SKU-AZ-09' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ example: 1499.99 })
  @IsOptional()
  @IsNumber()
  unitValue?: number;

  @ApiPropertyOptional({ enum: ReturnCondition })
  @IsOptional()
  @IsEnum(ReturnCondition)
  condition?: ReturnCondition;
}

export class CreateReturnDto {
  @ApiProperty({ example: 'Thabo Mokoena' })
  @IsString()
  customerName: string;

  @ApiPropertyOptional({ example: '+27821234567' })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional({ example: 'thabo@example.com' })
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiPropertyOptional({ example: '12 Long St, Cape Town' })
  @IsOptional()
  @IsString()
  pickupAddress?: string;

  @ApiPropertyOptional({
    description: 'Original outbound waybill tracking number to link this return to',
    example: 'FO-000123',
  })
  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @ApiPropertyOptional({ description: 'Original waybill id (alternative to trackingNumber)' })
  @IsOptional()
  @IsString()
  waybillId?: string;

  @ApiPropertyOptional({ enum: ReturnReason })
  @IsOptional()
  @IsEnum(ReturnReason)
  reason?: ReturnReason;

  @ApiPropertyOptional({ example: 'Box arrived crushed, item scratched' })
  @IsOptional()
  @IsString()
  reasonNote?: string;

  @ApiPropertyOptional({ enum: ReturnResolution })
  @IsOptional()
  @IsEnum(ReturnResolution)
  resolution?: ReturnResolution;

  @ApiPropertyOptional({ example: 1499.99, description: 'Refund owed to the customer' })
  @IsOptional()
  @IsNumber()
  refundAmount?: number;

  @ApiPropertyOptional({ example: 50, description: 'Restocking fee withheld' })
  @IsOptional()
  @IsNumber()
  restockFee?: number;

  @ApiPropertyOptional({ enum: ReturnStatus, description: 'Defaults to REQUESTED' })
  @IsOptional()
  @IsEnum(ReturnStatus)
  status?: ReturnStatus;

  @ApiPropertyOptional({ type: [ReturnItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items?: ReturnItemDto[];
}
