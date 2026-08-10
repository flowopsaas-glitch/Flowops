import { IsString, IsOptional, IsNumber, IsBoolean, Min } from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() tradingName?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() province?: string;
  @IsOptional() @IsString() postalCode?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() vatNumber?: string;
  @IsOptional() @IsString() registrationNumber?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() primaryColor?: string;
  @IsOptional() @IsString() brandName?: string;
  @IsOptional() @IsString() whatsappNumber?: string;
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() bankAccountNumber?: string;
  @IsOptional() @IsString() bankBranchCode?: string;
}

export class UpdateSlaDto {
  @IsOptional() @IsNumber() @Min(1) slaWarningMinutes?: number;
  @IsOptional() @IsNumber() @Min(1) slaBreachMinutes?: number;
  @IsOptional() @IsNumber() @Min(1) slaEscalateMinutes?: number;
}

export class AddAdminDto {
  @IsString() email: string;
  @IsString() name: string;
  @IsOptional() @IsString() phone?: string;
  @IsString() password: string;
}
