import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TRAIL_KINDS, type TrailKind } from '../audit-trail.types';

/**
 * Query parameters for `GET /audit/trail` and `/audit/summary`.
 *
 * Validation runs before the service, so a malformed date or an unknown kind is
 * a 400 from the pipe rather than a database call. `limit` is clamped in the
 * service as well — a DTO is a convenience, not a security control.
 */
export class TrailQueryDto {
  @ApiPropertyOptional({ enum: TRAIL_KINDS, description: 'Restrict to one source table.' })
  @IsOptional()
  @IsIn(TRAIL_KINDS as unknown as string[])
  kind?: TrailKind;

  @ApiPropertyOptional({
    description:
      'Free text. Matched against the event description, location and event code, ' +
      'plus the entity reference and actor name — the latter two are resolved to ids ' +
      'before the query so paging stays correct.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ example: 'DRIVER', description: 'Exact actor type, e.g. DRIVER | DISPATCH | WAREHOUSE | SYSTEM.' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  actorType?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp, inclusive.' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp, exclusive.' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ description: 'Opaque cursor from the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class TrailSummaryQueryDto {
  @ApiPropertyOptional({ default: 7, description: 'Window in days (1–365).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days?: number;
}
