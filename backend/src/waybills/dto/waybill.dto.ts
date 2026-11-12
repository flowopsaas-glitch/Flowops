import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Payload types for the waybill module.
 *
 * `WaybillsService.create()` does this:
 *
 *     data: { ...dto, trackingNumber, companyId }
 *
 * With `@Body() body: any` the global ValidationPipe has no metatype, so
 * `whitelist: true` strips nothing and the raw JSON reaches that spread. Only
 * `trackingNumber` and `companyId` are then overwritten — **every other column
 * is caller-controlled at creation time**, including:
 *
 *   `ratingToken`        a bearer capability. It is the token behind the
 *                        customer's public rating link (see withoutRatingToken,
 *                        which strips it from every response precisely because
 *                        it is a secret). Choosing it at create time means
 *                        holding it, which means forging the customer's rating.
 *
 *   `podImageUrl` /      proof of delivery — settable before anything is
 *   `podSignatureUrl` /  delivered.
 *   `podRecipient` /
 *   `podDeliveredAt`
 *
 *   `codCollected`,      the cash-reconciliation columns. These decide whether
 *   `codCollectedAmount`, a driver's cash is reconciled or short-paid.
 *   `codDiscrepancy`
 *
 *   `customerRating`,    the customer's own feedback.
 *   `customerRatingNote`
 *
 *   `id`                 would re-point every foreign key aimed at this row.
 *
 * `update()` is different: it already filters through WAYBILL_PATCHABLE_FIELDS,
 * and the comment there explains the same hazard. The DTO is still worth having
 * — it rejects bad types at the edge instead of writing them and letting the
 * database complain, and it makes the two surfaces agree on what is writable.
 *
 * `status` IS accepted on create, deliberately: WaybillCapture posts an
 * OCR-scanned waybill that may already be DELIVERED, and that is a real flow.
 */

/** Statuses a client may set when booking a waybill. */
export const WAYBILL_CREATE_STATUSES = [
  'PENDING',
  'COLLECTED',
  'IN_TRANSIT',
  'AT_ORIGIN_HUB',
  'AT_DESTINATION_HUB',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'EXCEPTION',
] as const;

export class CreateWaybillDto {
  @IsString()
  @MaxLength(200)
  senderName: string;

  @IsString()
  @MaxLength(50)
  senderPhone: string;

  @IsString()
  @MaxLength(500)
  senderAddress: string;

  @IsString()
  @MaxLength(200)
  recipientName: string;

  @IsString()
  @MaxLength(50)
  recipientPhone: string;

  @IsString()
  @MaxLength(500)
  recipientAddress: string;

  @IsOptional() @IsEmail() @MaxLength(200) senderEmail?: string;
  @IsOptional() @IsEmail() @MaxLength(200) recipientEmail?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) senderLat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) senderLng?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) recipientLat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) recipientLng?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) weight?: number;
  @IsOptional() @IsString() @MaxLength(200) dimensions?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) totalAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) codAmount?: number;

  @IsOptional() @IsIn([...WAYBILL_CREATE_STATUSES]) status?: string;

  // Everything else on the model is deliberately absent: generated, server-
  // controlled, or a capability the caller must not choose. See the header.
}

/**
 * Mirrors WAYBILL_PATCHABLE_FIELDS in the service. Kept in step by hand, and
 * `waybill.dto.spec.ts` asserts the two lists agree — so adding a field to one
 * without the other fails CI rather than silently diverging.
 */
export const WAYBILL_PATCHABLE = [
  'status',
  'senderName', 'senderPhone', 'senderEmail', 'senderAddress',
  'senderLat', 'senderLng',
  'recipientName', 'recipientPhone', 'recipientEmail', 'recipientAddress',
  'recipientLat', 'recipientLng',
  'weight', 'dimensions', 'description',
  'totalAmount', 'codAmount',
  'riskLevel', 'riskScore', 'riskNotes',
  'podSignatureUrl', 'podImageUrl', 'podRecipient', 'podDeliveredAt',
] as const;

export class UpdateWaybillDto {
  @IsOptional() @IsString() @MaxLength(40) status?: string;

  @IsOptional() @IsString() @MaxLength(200) senderName?: string;
  @IsOptional() @IsString() @MaxLength(50) senderPhone?: string;
  @IsOptional() @IsEmail() @MaxLength(200) senderEmail?: string;
  @IsOptional() @IsString() @MaxLength(500) senderAddress?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) senderLat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) senderLng?: number;

  @IsOptional() @IsString() @MaxLength(200) recipientName?: string;
  @IsOptional() @IsString() @MaxLength(50) recipientPhone?: string;
  @IsOptional() @IsEmail() @MaxLength(200) recipientEmail?: string;
  @IsOptional() @IsString() @MaxLength(500) recipientAddress?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) recipientLat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) recipientLng?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) weight?: number;
  @IsOptional() @IsString() @MaxLength(200) dimensions?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) totalAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) codAmount?: number;

  @IsOptional() @IsString() @MaxLength(40) riskLevel?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) riskScore?: number;
  @IsOptional() @IsString() @MaxLength(2000) riskNotes?: string;

  // POD is writable here on purpose — this is how delivery is recorded.
  @IsOptional() @IsString() @MaxLength(1000) podSignatureUrl?: string;
  @IsOptional() @IsString() @MaxLength(1000) podImageUrl?: string;
  @IsOptional() @IsString() @MaxLength(200) podRecipient?: string;
  @IsOptional() @IsString() @MaxLength(60) podDeliveredAt?: string;
}

/** Multipart body for POST /waybills/:id/deliver. */
export class RecordDeliveryDto {
  @IsString()
  @MaxLength(200)
  recipient: string;

  @IsOptional()
  @IsString()
  signatureBase64?: string;

  /**
   * Arrives as a JSON string from multipart form-data. Normalised here so the
   * validator sees an array; the service already tolerates both shapes.
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [trimmed];
      } catch {
        return [trimmed];
      }
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  scannedCodes?: string[];
}

/**
 * Overrides merged over the OCR-extracted data when committing an inbox item.
 * Deliberately the booking fields only: the merge result is handed to
 * `create()`, so anything writable here is writable on a waybill.
 */
export class CommitInboxDto {
  @IsOptional() @IsString() @MaxLength(200) senderName?: string;
  @IsOptional() @IsString() @MaxLength(50) senderPhone?: string;
  @IsOptional() @IsString() @MaxLength(500) senderAddress?: string;
  @IsOptional() @IsEmail() @MaxLength(200) senderEmail?: string;

  @IsOptional() @IsString() @MaxLength(200) recipientName?: string;
  @IsOptional() @IsString() @MaxLength(50) recipientPhone?: string;
  @IsOptional() @IsString() @MaxLength(500) recipientAddress?: string;
  @IsOptional() @IsEmail() @MaxLength(200) recipientEmail?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) weight?: number;
  @IsOptional() @IsString() @MaxLength(200) dimensions?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) totalAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) codAmount?: number;
  @IsOptional() @IsIn([...WAYBILL_CREATE_STATUSES]) status?: string;
}
