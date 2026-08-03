import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// ─── Request ────────────────────────────────────────────────────────────────

export class SmartResolveDto {
  @ApiProperty({ example: '123 Main Rd, JHB', description: 'Address to resolve' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string;

  @ApiPropertyOptional({ example: 'ZA', description: 'ISO country code override' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  country?: string;
}

// ─── Response types ─────────────────────────────────────────────────────────

export interface SmartGeoPoint {
  lat: number;
  lng: number;
  provider: 'addressbook' | 'nominatim' | 'google' | 'mapbox';
  formatted?: string;
}

export interface AddressSuggestion {
  id: string;
  label: string;
  address: string;
  city?: string | null;
  score: number;
  distanceKm?: number | null;
}

export interface SmartResolveResult {
  /** Resolved coordinates (null if nothing matched) */
  point: SmartGeoPoint | null;
  /** Canonical / cleaned version of the input address */
  canonical: string;
  /** Top suggestions from the company address book */
  suggestions: AddressSuggestion[];
  /** Confidence score 0-100 */
  confidence: number;
  /** How the resolution was achieved */
  source: 'addressbook' | 'geocode' | 'fuzzy' | 'none';
  /** Company context */
  companyId: string;
  /** Processing time in ms */
  resolvedInMs: number;
}
