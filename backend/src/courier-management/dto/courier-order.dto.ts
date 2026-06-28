import {
  IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
const STATUSES = ['NEW', 'ASSIGNED', 'DISPATCHED', 'COMPLETED', 'CANCELLED'] as const;

export class CreateCourierOrderDto {
  @IsString() @MaxLength(120)
  clientName!: string;

  @IsOptional() @IsString() @MaxLength(60)
  clientId?: string;

  @IsString() @MaxLength(300)
  pickupAddress!: string;

  @IsString() @MaxLength(300)
  dropoffAddress!: string;

  @IsOptional() @IsString() @MaxLength(120)
  contactName?: string;

  @IsOptional() @IsString() @MaxLength(40)
  contactPhone?: string;

  @IsOptional() @IsString() @MaxLength(500)
  itemsDesc?: string;

  @IsOptional() @IsInt() @Min(1)
  pieces?: number;

  @IsOptional() @IsNumber()
  weightKg?: number;

  @IsOptional() @IsIn(PRIORITIES)
  priority?: (typeof PRIORITIES)[number];

  @IsOptional() @IsString()
  windowStart?: string;

  @IsOptional() @IsString()
  windowEnd?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;
}

export class UpdateCourierOrderDto {
  @IsOptional() @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional() @IsString()
  assignedDriverId?: string;

  @IsOptional() @IsInt()
  sequence?: number;

  @IsOptional() @IsIn(PRIORITIES)
  priority?: (typeof PRIORITIES)[number];

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;
}

class PlanAssignmentDto {
  @IsString()
  driverId!: string;

  @IsArray() @IsString({ each: true })
  orderIds!: string[];
}

export class ApplyPlanDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanAssignmentDto)
  assignments!: PlanAssignmentDto[];
}
