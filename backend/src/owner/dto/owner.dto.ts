import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Request bodies for the owner console.
 *
 * These five handlers were taking a raw `any`. One of them, `draftTenant`, was
 * the most permissive write in the codebase:
 *
 *     draftTenant(dto) -> prisma.company.create({ data: { ...dto, isActive: false } })
 *
 * A raw spread into `company.create`. The controller is behind `OwnerAuthGuard`,
 * which fails closed, so this was never reachable by a tenant — but "only the
 * platform owner can reach it" is a thin argument when the write itself has no
 * shape at all. On the `Company` model that spread could set `id`,
 * `portalSubdomain`, `featureOverrides`, `priceOverrideZar`,
 * `commercialStatus`, `trialEndsAt`. None of those belong in a draft.
 *
 * The DTO below is the allowlist. `isActive` is deliberately absent: the service
 * sets it after the spread and owns that decision.
 */

/** A draft tenant sets identity and contact details — nothing else. */
export class DraftTenantDto {
  @IsString() @MaxLength(200) name: string;

  @IsOptional() @IsEmail() @MaxLength(200) email?: string;

  @IsOptional() @IsString() @MaxLength(40) phone?: string;

  /** 'starter' | 'growth' | 'scale' — kept open so a new plan does not need a deploy. */
  @IsOptional() @IsString() @MaxLength(40) plan?: string;

  @IsOptional() @IsString() @MaxLength(200) tradingName?: string;

  @IsOptional() @IsString() @MaxLength(300) address?: string;

  @IsOptional() @IsString() @MaxLength(120) city?: string;

  /** ISO 3166-1 alpha-2. */
  @IsOptional() @IsString() @MaxLength(2) country?: string;

  /** ISO 4217. */
  @IsOptional() @IsString() @MaxLength(3) currency?: string;

  @IsOptional() @IsString() @MaxLength(40) vatNumber?: string;
}

/** The service already typed this inline; the DTO adds the runtime check. */
export class CreateTenantAdminDto {
  @IsString() @MaxLength(120) name: string;

  @IsEmail() @MaxLength(200) email: string;

  /**
   * bcrypt-hashed at cost 12 by the service. A long password slows every login,
   * and bcrypt silently truncates past 72 bytes — so bound it here rather than
   * let a 10 MB string reach the hash.
   */
  @IsString() @MinLength(8) @MaxLength(128) password: string;
}

/**
 * Mirrors what `updateSubscriptionOverride` reads. Both fields are nullable
 * because sending null is how an owner clears an override — that is a different
 * write from omitting the field, and the service treats them differently.
 */
export class UpdateSubscriptionOverrideDto {
  @IsOptional() @IsObject() featureOverrides?: Record<string, unknown> | null;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1_000_000) priceOverrideZar?: number | null;
}

/** One line on an owner-raised invoice. Totals stay server-authoritative. */
export class OwnerInvoiceItemDto {
  @IsString() @MaxLength(300) description: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) quantity: number;

  @Type(() => Number) @IsNumber() @Min(0) @Max(100_000_000) unitPrice: number;
}

export class CreateTenantQuoteDto {
  @IsString() @MaxLength(300) fromAddress: string;

  @IsString() @MaxLength(300) toAddress: string;

  /** The service re-checks positivity; this keeps a string out of the arithmetic. */
  @Type(() => Number) @IsNumber() @Min(0) @Max(1_000_000) weight: number;

  @Type(() => Number) @IsNumber() @Min(0) @Max(100_000_000) price: number;

  @IsOptional() @IsString() @MaxLength(200) clientName?: string;

  @IsOptional() @IsString() @MaxLength(3) currency?: string;
}

/**
 * Shaped to what `InvoicesService.create` actually reads — clientName, items,
 * clientEmail, notes, dueDate, taxRate. The owner console sends clientName plus
 * a single item; everything else is optional.
 */
export class CreateTenantInvoiceDto {
  @IsString() @MaxLength(200) clientName: string;

  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => OwnerInvoiceItemDto)
  items: OwnerInvoiceItemDto[];

  @IsOptional() @IsEmail() @MaxLength(200) clientEmail?: string;

  @IsOptional() @IsString() @MaxLength(2000) notes?: string;

  @IsOptional() @IsDateString() dueDate?: string;

  /** Percentage. Server computes the totals, so this is only the rate. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) taxRate?: number;
}
