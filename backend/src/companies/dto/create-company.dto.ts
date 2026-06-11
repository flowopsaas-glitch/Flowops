import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  legalName?: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  vatNumber?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  subscriptionPlan?: string;

  @IsOptional()
  @IsArray()
  enabledFeatures?: string[];

  @IsOptional()
  @IsBoolean()
  onboardingComplete?: boolean;

  @IsOptional()
  @IsString()
  onboardingStep?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEmail()
  supportEmail?: string;

  @IsOptional()
  @IsEmail()
  opsEmail?: string;

  @IsOptional()
  @IsEmail()
  quotesEmail?: string;

  @IsOptional()
  @IsEmail()
  podsEmail?: string;

  @IsOptional()
  @IsEmail()
  notificationsEmail?: string;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;
}