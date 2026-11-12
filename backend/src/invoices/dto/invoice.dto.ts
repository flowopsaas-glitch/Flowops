import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Invoice bodies.
 *
 * `InvoicesService.create` already refuses to spread caller input — it builds
 * the write from an explicit allowlist and computes its own totals. This DTO is
 * the other half: it makes the contract legible at the edge and turns a
 * malformed payload into a 400 with a field name instead of a thrown
 * BadRequestException from three layers down.
 */

export class InvoiceItemDto {
  @IsString() @MaxLength(300) description: string;

  /** The service requires an integer in (0, 1_000_000]. */
  @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) quantity: number;

  @Type(() => Number) @IsNumber() @Min(0) @Max(100_000_000) unitPrice: number;

  /** Optional link to the job being billed. */
  @IsOptional() @IsString() @MaxLength(64) waybillId?: string;
}

export class CreateInvoiceDto {
  @IsString() @MaxLength(200) clientName: string;

  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];

  @IsOptional() @IsEmail() @MaxLength(200) clientEmail?: string;

  @IsOptional() @IsString() @MaxLength(2000) notes?: string;

  @IsOptional() @IsDateString() dueDate?: string;

  /** Percentage. The server computes the totals; this is only the rate. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) taxRate?: number;
}

/**
 * The only status a PATCH may set. The service enforces the same thing — an
 * invoice becomes SENT through this route, and PAID only through the payment
 * approval flow — so mirroring it here means a bad value never reaches the
 * service's own guard as a confusing 400.
 */
export class UpdateInvoiceDto {
  @IsEnum(['SENT']) status: string;
}

export class MarkInvoicePaidDto {
  /**
   * Optional. Omitted means "the full outstanding total". Given, it must be
   * positive and within a cent of the total — the service checks both.
   */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100_000_000) amount?: number;

  @IsOptional() @IsString() @MaxLength(500) note?: string;

  @IsOptional() @IsString() @MaxLength(120) paidBy?: string;
}
