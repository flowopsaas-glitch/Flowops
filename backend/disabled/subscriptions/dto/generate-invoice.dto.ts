// src/subscriptions/dto/generate-invoice.dto.ts
import { IsString, IsNumber } from 'class-validator';

export class GenerateInvoiceDto {
  @IsString()
  subscriptionId!: string;

  @IsNumber()
  amount!: number;
}
