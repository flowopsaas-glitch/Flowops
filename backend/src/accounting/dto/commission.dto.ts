import { IsBoolean, IsNumber, IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSalespersonDto {
  @ApiProperty({ example: 'Lerato Dlamini' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'lerato@yourco.za' })
  @IsOptional() @IsString()
  email?: string;

  @ApiPropertyOptional({ example: 5, description: 'Default commission rate (%)' })
  @IsOptional() @IsNumber()
  defaultCommissionPct?: number;
}

export class UpdateSalespersonDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  defaultCommissionPct?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class GenerateCommissionDto {
  @ApiProperty({ description: 'Salesperson to attribute commission to' })
  @IsString()
  salespersonId: string;

  @ApiProperty({ example: '2026-06', description: 'Period (YYYY-MM) — uses invoices PAID in this month' })
  @Matches(/^\d{4}-\d{2}$/, { message: 'periodMonth must be in YYYY-MM format' })
  periodMonth: string;

  @ApiPropertyOptional({ description: 'Override commission rate (%). Defaults to the salesperson rate.' })
  @IsOptional() @IsNumber()
  ratePct?: number;

  @ApiPropertyOptional({
    description: "Commission base: 'subtotal' (ex-VAT, default) or 'total' (incl VAT)",
    example: 'subtotal',
  })
  @IsOptional() @IsString()
  basis?: 'subtotal' | 'total';

  @ApiPropertyOptional({ description: 'Restrict to these invoice ids (otherwise all paid in the month)' })
  @IsOptional()
  invoiceIds?: string[];
}
