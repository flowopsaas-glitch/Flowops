import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Disbursement bodies — money paid out to an authority on a client's behalf.
 *
 * `update` was the hole:
 *
 *     const { id: _i, companyId: _c, ...data } = dto ?? {};
 *     prisma.disbursement.update({ where: { id }, data });
 *
 * Two keys stripped, everything else written. That left `status`, `recoveredAt`,
 * `createdAt` and `updatedAt` caller-settable — meaning a client could mark its
 * own disbursement RECOVERED without going through `markRecovered`, or backdate
 * a payment. `UpdateDisbursementDto` is the allowlist.
 *
 * `amount` also had no bound: `Number(dto.amount ?? 0)` turns `"abc"` into NaN,
 * which Prisma rejects on a Float column with a 500 rather than a 400.
 */

export const DISBURSEMENT_STATUSES = ['OUTSTANDING', 'INVOICED', 'RECOVERED', 'WRITTEN_OFF'] as const;

/** Categories the schema documents; left open because authorities vary. */
export class CreateDisbursementDto {
  @Type(() => Number) @IsNumber() @Min(0) @Max(100_000_000) amount: number;

  @IsOptional() @IsString() @MaxLength(64) fileId?: string;

  @IsOptional() @IsString() @MaxLength(200) clientName?: string;

  /** SARS, port authority, shipping line, airline. */
  @IsOptional() @IsString() @MaxLength(120) authority?: string;

  /** DUTY | VAT | PORT | LINE | STORAGE | OTHER */
  @IsOptional() @IsString() @MaxLength(32) category?: string;

  @IsOptional() @IsString() @MaxLength(120) reference?: string;

  @IsOptional() @IsString() @MaxLength(1000) description?: string;

  @IsOptional() @IsString() @MaxLength(3) currency?: string;

  @IsOptional() @IsEnum(DISBURSEMENT_STATUSES as unknown as string[]) status?: string;

  @IsOptional() @IsDateString() paidAt?: string;
}

export class UpdateDisbursementDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100_000_000) amount?: number;

  @IsOptional() @IsString() @MaxLength(64) fileId?: string;

  @IsOptional() @IsString() @MaxLength(200) clientName?: string;

  @IsOptional() @IsString() @MaxLength(120) authority?: string;

  @IsOptional() @IsString() @MaxLength(32) category?: string;

  @IsOptional() @IsString() @MaxLength(120) reference?: string;

  @IsOptional() @IsString() @MaxLength(1000) description?: string;

  @IsOptional() @IsString() @MaxLength(3) currency?: string;

  /**
   * Kept writable because `setStatus` (a separate, guarded route) is not the
   * only path — but constrained to the enum, so "RECOVERED" still cannot be
   * smuggled in with a backdated `recoveredAt`.
   */
  @IsOptional() @IsEnum(DISBURSEMENT_STATUSES as unknown as string[]) status?: string;

  @IsOptional() @IsDateString() paidAt?: string;

  /**
   * The service validates this belongs to the same company before writing it,
   * and treats `undefined` (leave alone) differently from `null` (unlink).
   */
  @IsOptional() @IsString() @MaxLength(64) invoiceId?: string | null;
}

export class RecoverDisbursementDto {
  @IsOptional() @IsString() @MaxLength(64) invoiceId?: string;
}
