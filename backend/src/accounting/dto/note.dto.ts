import {
  IsArray, IsEmail, IsNumber, IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NoteItemDto {
  @ApiProperty({ example: 'Re-delivery fee reversal' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @IsNumber() @Min(1)
  quantity?: number;

  @ApiProperty({ example: 150 })
  @IsNumber()
  unitPrice: number;
}

/** Shared shape for creating a credit OR debit note. */
export class CreateNoteDto {
  @ApiProperty({ example: 'Acme (Pty) Ltd' })
  @IsString()
  clientName: string;

  @ApiPropertyOptional({ example: 'accounts@acme.co.za' })
  @IsOptional() @IsEmail()
  clientEmail?: string;

  @ApiPropertyOptional({ description: 'Invoice this note adjusts' })
  @IsOptional() @IsString()
  invoiceId?: string;

  @ApiPropertyOptional({ example: 'Goods returned damaged' })
  @IsOptional() @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'VAT rate percent applied to the subtotal (default 15)',
    example: 15,
  })
  @IsOptional() @IsNumber()
  taxRate?: number;

  @ApiProperty({ type: [NoteItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NoteItemDto)
  items: NoteItemDto[];
}

export class UpdateNoteDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString()
  clientName?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsEmail()
  clientEmail?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  invoiceId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  taxRate?: number;

  @ApiPropertyOptional({ type: [NoteItemDto] })
  @IsOptional() @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NoteItemDto)
  items?: NoteItemDto[];
}

export class ApplyCreditNoteDto {
  @ApiPropertyOptional({ description: 'Invoice to offset the credit against' })
  @IsOptional() @IsString()
  invoiceId?: string;

  @ApiPropertyOptional({ description: 'Amount to apply (defaults to remaining balance)' })
  @IsOptional() @IsNumber()
  amount?: number;
}
