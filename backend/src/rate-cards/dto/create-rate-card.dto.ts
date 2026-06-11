import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateRateCardDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional() @IsString()
  clientName?: string;

  @IsOptional() @IsString()
  contractCode?: string;

  @IsOptional() @IsString()
  billingMode?: string;

  @IsOptional() @IsString()
  payerSide?: string;

  @IsOptional() @IsString()
  notes?: string;

  @IsOptional() @IsString()
  aiPricingNote?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsNumber() baseFee?: number;
  @IsOptional() @IsNumber() perKm?: number;
  @IsOptional() @IsNumber() perKg?: number;
  @IsOptional() @IsNumber() minimumCharge?: number;

  @IsOptional() @IsNumber() fuelSurchargePercent?: number;
  @IsOptional() @IsNumber() vatPercent?: number;

  @IsOptional() @IsNumber() @Min(1)
  volumetricDivisor?: number;

  @IsOptional() @IsNumber() costBase?: number;
  @IsOptional() @IsNumber() costPerKm?: number;
  @IsOptional() @IsNumber() costPerKg?: number;
  @IsOptional() @IsNumber() targetMarginPercent?: number;
  @IsOptional() @IsNumber() minimumMarginAmount?: number;

  @IsOptional() @IsNumber() longHaulThresholdKm?: number;
  @IsOptional() @IsNumber() longHaulMultiplier?: number;
  @IsOptional() @IsNumber() remoteAreaMultiplier?: number;
  @IsOptional() @IsNumber() afterHoursMultiplier?: number;

  @IsOptional() @IsNumber()
  companyId?: number;
}
