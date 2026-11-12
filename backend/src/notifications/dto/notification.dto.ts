import { IsBoolean, IsEnum, IsOptional, Matches, MaxLength } from 'class-validator';

/**
 * Notification preferences.
 *
 * This was the last raw spread in the module:
 *
 *     upsert({
 *       update: { ...dto, updatedAt: new Date() },
 *       create: { userId, ...dto },
 *     })
 *
 * `updatedAt` is overwritten on the update branch, but nothing stops a caller
 * setting it on the create branch — and `id` is writable on both. The row is
 * keyed by userId and upserted, so a client-chosen `id` on create collides with
 * an existing row: one user's preferences silently fail to save, or worse,
 * another user's row is the one that comes back.
 *
 * Every field below is one of the model's real columns. Nothing else survives.
 */

export const DIGEST_FREQUENCIES = ['INSTANT', 'DAILY', 'WEEKLY'] as const;

/** 24-hour clock, "22:00". Quiet hours are stored as text and compared as text. */
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdatePreferencesDto {
  // Master channel toggles
  @IsOptional() @IsBoolean() emailEnabled?: boolean;
  @IsOptional() @IsBoolean() smsEnabled?: boolean;
  @IsOptional() @IsBoolean() pushEnabled?: boolean;

  // Per-category x channel
  @IsOptional() @IsBoolean() operationsEmail?: boolean;
  @IsOptional() @IsBoolean() operationsSms?: boolean;
  @IsOptional() @IsBoolean() operationsPush?: boolean;
  @IsOptional() @IsBoolean() billingEmail?: boolean;
  @IsOptional() @IsBoolean() billingPush?: boolean;
  @IsOptional() @IsBoolean() securityEmail?: boolean;
  @IsOptional() @IsBoolean() securityPush?: boolean;
  @IsOptional() @IsBoolean() systemEmail?: boolean;
  @IsOptional() @IsBoolean() systemPush?: boolean;

  @IsOptional() @IsEnum(DIGEST_FREQUENCIES as unknown as string[]) digestFrequency?: string;

  @IsOptional() @IsBoolean() quietHoursEnabled?: boolean;

  @IsOptional() @Matches(HH_MM) quietHoursStart?: string;

  @IsOptional() @Matches(HH_MM) quietHoursEnd?: string;

  /** Stored verbatim and used to schedule digests, so it is length-bounded. */
  @IsOptional() @MaxLength(64) timezone?: string;
}
