import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Paystack bodies — excluding the webhook, which is exempt (see
 * scripts/body-any-exemptions.json): its gate is an HMAC over the raw body, and
 * a validating DTO there would break the integration the first time Paystack
 * adds a field.
 *
 * `initializePayment` is the tenant-facing one and the more interesting of the
 * two: `amount` is in the smallest currency unit (kobo/cents) and is what
 * actually gets charged, so it is bounded and required. `email` falls back to
 * the caller's own address when absent, which is why it is optional here.
 */

export class InitializePaymentDto {
  /**
   * Smallest currency unit — kobo for ZAR. Required: this is the amount that
   * gets charged, so a missing value must not become a silent zero.
   */
  @Type(() => Number) @IsInt() @Min(1) @Max(100_000_000_000) amount: number;

  /** Defaults to the authenticated user's email when omitted. */
  @IsOptional() @IsEmail() @MaxLength(200) email?: string;

  @IsOptional() @IsString() @MaxLength(64) invoiceId?: string;

  @IsOptional() @IsString() @MaxLength(300) description?: string;

  /** Must be an https URL to a Paystack-approved host; the service enforces it. */
  @IsOptional() @IsString() @MaxLength(2048) callbackUrl?: string;

  /**
   * Free-form, passed through to Paystack and echoed back on the webhook.
   * Bounded by size so it cannot be used to smuggle a large blob through.
   */
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CreatePlanDto {
  @IsString() @MaxLength(200) name: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(100_000_000_000) amount: number;

  /** Paystack interval: hourly, daily, weekly, monthly, quarterly, annually. */
  @IsString() @MaxLength(32) interval: string;

  @IsOptional() @IsString() @MaxLength(500) description?: string;
}
