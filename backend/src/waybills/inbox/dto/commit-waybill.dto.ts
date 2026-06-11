import { IsString, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentType } from '@prisma/client';

export class CommitWaybillDto {
  @IsString()
  waybillNumber: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  totalAmount: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  weightKg?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  senderName?: string;

  @IsString()
  recipientName: string;

  @IsString()
  recipientAddress: string;

  // No @IsString() here because it's an Enum now
  @IsOptional()
  paymentType?: PaymentType; 
}
