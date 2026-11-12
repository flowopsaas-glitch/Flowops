import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Request bodies for the operational half of the forwarding module.
 *
 * `CreateShipmentFileDto` / `UpdateShipmentFileDto` already existed; these cover
 * the six handlers that were still taking a raw `any` body.
 *
 * A note on why this file is worth reading rather than skimmed: the services
 * here build their Prisma calls field by field (an allowlist by construction),
 * so nothing in this module is a mass-assignment hole today. What the raw body
 * did allow was unbounded input — a `vgmKg` of 1e300, a `secret` of ten
 * megabytes, a `customsValue` of `NaN`, a `containerNo` that is an object. The
 * bounds below are the point, not the types.
 */

// ── Containers & cargo ───────────────────────────────────────────────────────

export class AddContainerDto {
  /**
   * Validated as a container number by `checkContainerNumber` downstream, which
   * warns rather than blocks. Bound the length so an 11-character field cannot
   * become a megabyte of payload.
   */
  @IsString() @MaxLength(32) containerNo: string;

  /** ISO 6346 size/type — always 4 characters ('22GP', '40HQ'). */
  @IsString() @MaxLength(8) isoType: string;

  @IsOptional() @IsString() @MaxLength(32) sealNo?: string;

  /** Verified gross mass. A 40ft box tops out well under 45,000 kg. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100_000) vgmKg?: number;
}

export class AddCargoDto {
  @IsString() @MaxLength(500) description: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) pieces?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(10_000_000) weightKg?: number;

  @IsOptional() @IsString() @MaxLength(120) dimensions?: string;

  /** Harmonised System code — 6 to 10 digits, stored as text. */
  @IsOptional() @IsString() @MaxLength(16) hsCode?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1_000_000_000) customsValue?: number;
}

export class UpdateCargoDto {
  @IsOptional() @IsString() @MaxLength(500) description?: string;

  @IsOptional() @IsString() @MaxLength(16) hsCode?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1_000_000_000) customsValue?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) dutyRatePct?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) pieces?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(10_000_000) weightKg?: number;

  @IsOptional() @IsString() @MaxLength(120) dimensions?: string;
}

// ── Charges ──────────────────────────────────────────────────────────────────

export class AddChargeDto {
  @IsString() @MaxLength(300) description: string;

  /** Coerced to upper case by the service; default 'ZAR'. */
  @IsOptional() @IsString() @MaxLength(3) currency?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-1_000_000_000) @Max(1_000_000_000) cost?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-1_000_000_000) @Max(1_000_000_000) sell?: number;

  @IsOptional() @IsString() @MaxLength(120) invoiceTo?: string;
}

// ── Demurrage / detention ────────────────────────────────────────────────────

export class SetDemurrageTermsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) freeDays?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1_000_000) perDiemRate?: number;

  /** Null clears the date — which is why these are nullable, not merely optional. */
  @IsOptional() @IsDateString() availableFrom?: string | null;

  @IsOptional() @IsDateString() returnedAt?: string | null;
}

// ── Customs EDI credentials ──────────────────────────────────────────────────

/** Mirrors VALID_PATHS in customs-edi-credential.service.ts. */
export const EDI_PATHS = [
  'DIRECT_EDI',
  'SERVICE_PROVIDER',
  'CLEARING_AGENT_HANDOFF',
] as const;
export type EdiPath = (typeof EDI_PATHS)[number];

export class UpsertEdiCredentialDto {
  /**
   * The service re-checks membership itself and throws BadRequest — keeping the
   * check here too means a bad path is a 400 from the pipe with a proper
   * validation message, rather than a thrown exception from deeper in.
   */
  @IsIn(EDI_PATHS as unknown as string[]) path: EdiPath;

  @IsOptional() @IsString() @MaxLength(64) customsClientCode?: string;

  @IsOptional() @IsString() @MaxLength(120) providerName?: string;

  @IsOptional() @IsString() @MaxLength(500) endpointUrl?: string;

  /**
   * Required by the service when path is CLEARING_AGENT_HANDOFF. Not expressed
   * as a conditional decorator: the service's own check is the authority, and
   * duplicating it here would be two places to keep in step.
   */
  @IsOptional() @IsEmail() @MaxLength(200) agentEmail?: string;

  /**
   * Plaintext API key, AES-256-GCM encrypted at rest and never returned.
   * Bounded because it is encrypted and stored on every upsert.
   */
  @IsOptional() @IsString() @MaxLength(4096) secret?: string;
}
