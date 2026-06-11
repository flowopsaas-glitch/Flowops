import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreateDispatchJobDto {
  @IsOptional()
  @IsString()
  @IsIn(["COLLECTION", "DELIVERY", "TRANSFER", "RETURNS"])
  jobType?: "COLLECTION" | "DELIVERY" | "TRANSFER" | "RETURNS";

  @IsOptional()
  @IsString()
  @IsIn(["LOW", "NORMAL", "HIGH", "URGENT"])
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  collectionAddress?: string;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  dueAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  parcelCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weightKg?: number;

  @IsOptional()
  @IsString()
  serviceLevel?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  sourceBookingRequestId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  sourceCollectionId?: number;

  @IsOptional()
  @IsString()
  sourceWaybillId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isUrgent?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  slaRisk?: boolean;
}
