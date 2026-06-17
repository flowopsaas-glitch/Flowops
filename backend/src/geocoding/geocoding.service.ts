import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type GeoPoint = {
  lat: number;
  lng: number;
  provider: string;
  formatted?: string;
};

/**
 * Address -> coordinates. This is the foundation for routing, the live map,
 * ETA calculation, and the public tracking page.
 *
 * Provider is configurable via GEOCODER_PROVIDER:
 *   - "nominatim" (default): free OpenStreetMap geocoder, no API key. Matches
 *     the OSM tiles the dashboard map already uses. Subject to OSM usage policy
 *     (<=1 req/s, descriptive User-Agent) — fine for our volume, and we cache.
 *   - "google":  uses GOOGLE_MAPS_API_KEY (best accuracy/coverage).
 *   - "mapbox":  uses MAPBOX_TOKEN.
 *
 * Failures return null (callers degrade gracefully — a missing coordinate
 * never blocks creating a collection/waybill).
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly provider: string;
  private readonly googleKey: string;
  private readonly mapboxToken: string;
  private readonly defaultCountry: string;

  // Simple in-memory cache keyed by normalised address to avoid repeat lookups
  // (and to stay well within free-tier rate limits).
  private readonly cache = new Map<string, GeoPoint | null>();

  constructor(private readonly config: ConfigService) {
    this.provider = (config.get<string>('GEOCODER_PROVIDER', 'nominatim') || 'nominatim').toLowerCase();
    this.googleKey = config.get<string>('GOOGLE_MAPS_API_KEY', '') || '';
    this.mapboxToken = config.get<string>('MAPBOX_TOKEN', '') || '';
    this.defaultCountry = config.get<string>('DEFAULT_COUNTRY', 'za') || 'za';
  }

  private key(address: string, country?: string) {
    return `${(country || this.defaultCountry).toLowerCase()}::${address.trim().toLowerCase()}`;
  }

  async geocode(address?: string | null, country?: string): Promise<GeoPoint | null> {
    if (!address || !address.trim()) return null;
    const cacheKey = this.key(address, country);
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey) ?? null;

    let result: GeoPoint | null = null;
    try {
      if (this.provider === 'google' && this.googleKey) {
        result = await this.geocodeGoogle(address);
      } else if (this.provider === 'mapbox' && this.mapboxToken) {
        result = await this.geocodeMapbox(address);
      } else {
        result = await this.geocodeNominatim(address, country);
      }
    } catch (err: any) {
      this.logger.warn(`Geocoding failed for "${address}": ${err?.message ?? err}`);
      result = null;
    }

    this.cache.set(cacheKey, result);
    return result;
  }

  private async fetchJson(url: string, headers: Record<string, string> = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async geocodeNominatim(address: string, country?: string): Promise<GeoPoint | null> {
    const cc = (country || this.defaultCountry).toLowerCase();
    const params = new URLSearchParams({
      q: address,
      format: 'json',
      limit: '1',
      addressdetails: '0',
    });
    if (cc) params.set('countrycodes', cc);
    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
    // Nominatim requires a descriptive User-Agent identifying the application.
    const data = await this.fetchJson(url, { 'User-Agent': 'FlowOps-Logistics/1.0 (geocoding)' });
    if (Array.isArray(data) && data.length > 0) {
      const top = data[0];
      return {
        lat: parseFloat(top.lat),
        lng: parseFloat(top.lon),
        provider: 'nominatim',
        formatted: top.display_name,
      };
    }
    return null;
  }

  private async geocodeGoogle(address: string): Promise<GeoPoint | null> {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address,
    )}&key=${this.googleKey}`;
    const data = await this.fetchJson(url);
    const top = data?.results?.[0];
    if (top?.geometry?.location) {
      return {
        lat: top.geometry.location.lat,
        lng: top.geometry.location.lng,
        provider: 'google',
        formatted: top.formatted_address,
      };
    }
    return null;
  }

  private async geocodeMapbox(address: string): Promise<GeoPoint | null> {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      address,
    )}.json?limit=1&access_token=${this.mapboxToken}`;
    const data = await this.fetchJson(url);
    const top = data?.features?.[0];
    if (Array.isArray(top?.center) && top.center.length === 2) {
      return {
        lat: top.center[1],
        lng: top.center[0],
        provider: 'mapbox',
        formatted: top.place_name,
      };
    }
    return null;
  }

  /** Great-circle distance in kilometres between two coordinates. */
  static haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const lat1 = toRad(aLat);
    const lat2 = toRad(bLat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
}
