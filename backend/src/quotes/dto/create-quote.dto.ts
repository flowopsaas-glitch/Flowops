// src/quotes/dto/create-quote.dto.ts
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateQuoteDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  // Only SUPER_ADMIN can set this explicitly.
  // Everyone else will be forced to their JWT companyId.
  @IsOptional()
  @IsInt()
  @Min(1)
  companyId?: number;
}