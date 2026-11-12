import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Address-book bodies.
 *
 * The service already runs these through `withCompanyId`, which strips
 * companyId / id / createdAt / updatedAt and pins the tenant — so the
 * tenant-scoping property is handled. What is left is shape: `lat`/`lng` with
 * no range, a `type` with no membership check, and free-text lengths.
 */

export const ADDRESS_TYPES = ['SENDER', 'RECEIVER', 'BOTH'] as const;

export class CreateAddressDto {
  @IsString() @MaxLength(120) label: string;

  @IsString() @MaxLength(200) name: string;

  @IsString() @MaxLength(500) address: string;

  @IsOptional() @IsIn(ADDRESS_TYPES as unknown as string[]) type?: string;

  @IsOptional() @IsString() @MaxLength(200) company?: string;

  @IsOptional() @IsString() @MaxLength(40) phone?: string;

  @IsOptional() @IsEmail() @MaxLength(200) email?: string;

  @IsOptional() @IsString() @MaxLength(120) city?: string;

  @IsOptional() @IsString() @MaxLength(20) postalCode?: string;

  /** ISO 3166-1 alpha-2. */
  @IsOptional() @IsString() @MaxLength(2) country?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) lat?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) lng?: number;
}

export class UpdateAddressDto {
  @IsOptional() @IsString() @MaxLength(120) label?: string;

  @IsOptional() @IsString() @MaxLength(200) name?: string;

  @IsOptional() @IsString() @MaxLength(500) address?: string;

  @IsOptional() @IsIn(ADDRESS_TYPES as unknown as string[]) type?: string;

  @IsOptional() @IsString() @MaxLength(200) company?: string;

  @IsOptional() @IsString() @MaxLength(40) phone?: string;

  @IsOptional() @IsEmail() @MaxLength(200) email?: string;

  @IsOptional() @IsString() @MaxLength(120) city?: string;

  @IsOptional() @IsString() @MaxLength(20) postalCode?: string;

  @IsOptional() @IsString() @MaxLength(2) country?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) lat?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) lng?: number;

  @IsOptional() @IsBoolean() isActive?: boolean;
}
