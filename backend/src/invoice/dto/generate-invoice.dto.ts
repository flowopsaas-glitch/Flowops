// src/invoices/dto/generate-invoice.dto.ts
import { IsISO8601, IsInt } from 'class-validator';

export class GenerateInvoiceDto {
  @IsInt()
  courierId!: number;

  @IsISO8601()
  periodStart!: string;

  @IsISO8601()
  periodEnd!: string;
}