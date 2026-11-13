import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Booking portal DTOs.
 *
 * Two surfaces share these types and they do NOT share a trust model:
 *
 *   - the tenant surface (JWT, companyId from the session) manages links and
 *     works the resulting requests;
 *   - the public surface (no auth, capability token in the path) can only
 *     submit a request.
 *
 * The public DTO therefore carries no status, no companyId and no link id.
 * Anything the client may not set is simply absent from the type, so a stray
 * field is a validation failure rather than a silent override.
 */

/**
 * Request lifecycle.
 *
 * Lowercase, because `pending` is the default the table shipped with in the
 * init migration. Uppercasing these constants without also changing that
 * default would let a row written by the database land outside this set.
 */
export const BOOKING_REQUEST_STATUSES = ['pending', 'accepted', 'rejected'] as const;
export type BookingRequestStatus = (typeof BOOKING_REQUEST_STATUSES)[number];

/**
 * Legal moves. A decided request is final: re-opening it would let a customer
 * resubmit into a quote or waybill that has already been raised and priced.
 */
export const ALLOWED_TRANSITIONS: Record<BookingRequestStatus, BookingRequestStatus[]> = {
  pending: ['accepted', 'rejected'],
  accepted: [],
  rejected: [],
};

/** Statuses a tenant may ask for when filtering. */
export const REQUEST_FILTER_STATUSES = BOOKING_REQUEST_STATUSES;

export class CreateLinkDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  /** ISO-8601. Null/undefined means the link never expires. */
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateLinkDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** ISO-8601. */
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class ListRequestsQueryDto {
  @IsOptional()
  @IsEnum(REQUEST_FILTER_STATUSES as unknown as string[])
  status?: BookingRequestStatus;

  @IsOptional()
  @IsString()
  linkId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  take?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  skip?: number;
}

export class TransitionRequestDto {
  @IsEnum(['accepted', 'rejected'] as unknown as string[])
  status: Extract<BookingRequestStatus, 'accepted' | 'rejected'>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/**
 * What an anonymous visitor may submit through a portal link.
 *
 * Deliberately no `status`, no `companyId`, no `linkId`: those are decided by
 * the link the request arrived on, never by the body.
 */
export class PublicSubmitRequestDto {
  @IsString()
  @MaxLength(120)
  senderName: string;

  @IsString()
  @MaxLength(40)
  senderPhone: string;

  @IsString()
  @MaxLength(500)
  senderAddress: string;

  @IsString()
  @MaxLength(120)
  recipientName: string;

  @IsString()
  @MaxLength(40)
  recipientPhone: string;

  @IsString()
  @MaxLength(500)
  recipientAddress: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
