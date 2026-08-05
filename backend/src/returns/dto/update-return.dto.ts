import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ReturnReason, ReturnResolution, ReturnStatus, ReturnCondition,
} from '@prisma/client';

/** Partial update of a return — every field optional. */
export class UpdateReturnDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString()
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  customerPhone?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  customerEmail?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  pickupAddress?: string;

  @ApiPropertyOptional({ enum: ReturnReason })
  @IsOptional() @IsEnum(ReturnReason)
  reason?: ReturnReason;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  reasonNote?: string;

  @ApiPropertyOptional({ enum: ReturnStatus })
  @IsOptional() @IsEnum(ReturnStatus)
  status?: ReturnStatus;

  @ApiPropertyOptional({ enum: ReturnResolution })
  @IsOptional() @IsEnum(ReturnResolution)
  resolution?: ReturnResolution;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  refundAmount?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  restockFee?: number;

  @ApiPropertyOptional({ description: 'Driver assigned to collect the return' })
  @IsOptional() @IsString()
  assignedDriverId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  inspectionNotes?: string;

  @ApiPropertyOptional({ enum: ReturnCondition })
  @IsOptional() @IsEnum(ReturnCondition)
  condition?: ReturnCondition;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  restocked?: boolean;
}

/** Body for the lifecycle transition endpoint. */
export class ReturnTransitionDto {
  @ApiPropertyOptional({ description: 'Driver to assign when scheduling a collection' })
  @IsOptional() @IsString()
  assignedDriverId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ enum: ReturnResolution, description: 'Resolution when completing' })
  @IsOptional() @IsEnum(ReturnResolution)
  resolution?: ReturnResolution;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  refundAmount?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  restockFee?: number;

  @ApiPropertyOptional({ enum: ReturnCondition })
  @IsOptional() @IsEnum(ReturnCondition)
  condition?: ReturnCondition;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  restocked?: boolean;

  @ApiPropertyOptional({ description: 'Reason/notes for the transition (e.g. rejection reason)' })
  @IsOptional() @IsString()
  note?: string;
}
