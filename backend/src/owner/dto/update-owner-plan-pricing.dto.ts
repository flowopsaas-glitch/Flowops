import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class OwnerPlanPricingItemDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsInt()
  @Min(0)
  priceMonthly!: number;

  @IsInt()
  @Min(1)
  maxUsers!: number;

  @IsInt()
  @Min(1)
  maxBranches!: number;

  @IsOptional()
  @IsBoolean()
  aiEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  whatsappEnabled?: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateOwnerPlanPricingDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OwnerPlanPricingItemDto)
  plans!: OwnerPlanPricingItemDto[];
}
