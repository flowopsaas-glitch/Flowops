// src/quotes/dto/update-quote.dto.ts
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateQuoteDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;
}