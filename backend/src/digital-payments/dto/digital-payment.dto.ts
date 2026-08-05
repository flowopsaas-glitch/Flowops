import { IsString, IsOptional, IsNumber, IsEnum, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PaymentMethod {
  CARD = 'CARD',
  EFT = 'EFT',
  MOBILE_MONEY = 'MOBILE_MONEY',
  QR_CODE = 'QR_CODE',
  CASH = 'CASH',
}

export enum PaymentGateway {
  PAYSTACK = 'PAYSTACK',
  OZOW = 'OZOW',
  YOCO = 'YOCO',
  MANUAL = 'MANUAL',
}

export class CreatePaymentDto {
  @ApiProperty() @IsNumber() amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) method: PaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() waybillId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() driverId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() payerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() payerPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() payerEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(PaymentGateway) gateway?: PaymentGateway;
}

export class ConfirmPaymentDto {
  @ApiProperty() @IsString() reference: string;
  @ApiPropertyOptional() @IsOptional() @IsString() externalId?: string;
}
