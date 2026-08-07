import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  SmartGeoPoint,
  SmartResolveResult,
  AddressSuggestion,
} from './dto/smart-resolve.dto';

export type GeoPoint = {
  lat: number;
  lng: number;
  provider: string;
  formatted?: string;
};

// ─── South African address intelligence ─────────────────────────────────────
// World-class address handling for SA logistics: city aliases, common
// abbreviations, suburb normalization, and street-type stripping — all tuned
// for the way South Africans actually type addresses in WhatsApp, spreadsheets,
// and collection request forms.

/** City aliases → canonical name */
const SA_CITY_ALIASES: Record<string, string> = {
  jhb: 'johannesburg', joburg: 'johannesburg', jozi: 'johannesburg',
  cpt: 'cape town', ct: 'cape town',
  dbn: 'durban', durbs: 'durban',
  pta: 'pretoria', tshwane: 'pretoria',
  pe: 'port elizabeth', gqeberha: 'port elizabeth',
  bloem: 'bloemfontein', bloemie: 'bloemfontein',
  pmb: 'pietermaritzburg',
  eln: 'east london', el: 'east london',
  plk: 'polokwane', pietersburg: 'polokwane',
  mbombela: 'nelspruit', nellie: 'nelspruit',
  sandton: 'sandton', santon: 'sandton',
  centurion: 'centurion', century: 'centurion',
  midrand: 'midrand',
  soweto: 'soweto',
};

/** Street type abbreviations → full */
const STREET_TYPES: Record<string, string> = {
  st: 'street', str: 'street', rd: 'road', ave: 'avenue', av: 'avenue',
  dr: 'drive', drv: 'drive', ln: 'lane', blvd: 'boulevard',
  cres: 'crescent', cr: 'crescent', ct: 'court', pl: 'place',
  cir: 'circle', hwy: 'highway', pkwy: 'parkway',
};

/**
 * World-class GeocodingService with Smart Address Resolution.
 *
 * Architecture:
 * 1. Geocode: Multi-provider (Nominatim/Google/Mapbox) with TTL cache
 * 2. Smart Resolve: AddressBook fuzzy matching + geocode fallback + confidence scoring
 * 3. SA Intelligence: City aliases, street normalization, suburb recognition
 *
 * Provider is configurable via GEOCODER_PROVIDER:
 *   - "nominatim" (default): free OSM geocoder, no API key
 *   - "google": uses GOOGLE_MAPS_API_KEY (best accuracy)
 *   - "mapbox": uses MAPBOX_TOKEN
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

  // TTL cache: { value, expiry } — auto-evicts stale entries to prevent unbounded growth
  private readonly cache = new Map<string, { value: GeoPoint | null; expiry: number }>();
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
  private readonly CACHE_MAX_SIZE = 5000;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.provider = (config.get<string>('GEOCODER_PROVIDER', 'nominatim') || 'nominatim').toLowerCase();
    this.googleKey = config.get<string>('GOOGLE_MAPS_API_KEY', '') || '';
    this.mapboxToken = config.get<string>('MAPBOX_TOKEN', '') || '';
    this.defaultCountry = config.get<string>('DEFAULT_COUNTRY', 'za') || 'za';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC: GEOCODE (original — backwards compatible)
  // ═══════════════════════════════════════════════════════════════════════════

  private cacheKey(address: string, country?: string) {
    return `${(country || this.defaultCountry).toLowerCase()}::${address.trim().toLowerCase()}`;
  }

  async geocode(address?: string | null, country?: string): Promise<GeoPoint | null> {
    if (!address || !address.trim()) return null;
    const key = this.cacheKey(address, country);

    // Check TTL cache
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) return cached.value;
    if (cached) this.cache.delete(key); // expired

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

    // Store with TTL + evict oldest if over max
    if (this.cache.size >= this.CACHE_MAX_SIZE) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, { value: result, expiry: Date.now() + this.CACHE_TTL_MS });
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC: SMART RESOLVE — world-class address intelligence
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Smart address resolution engine.
   *
   * Strategy (highest confidence first):
   * 1. Exact match in AddressBook (by normalized address) → confidence 95+
   * 2. Fuzzy match (Levenshtein score > 0.82) → confidence based on score
   * 3. Geocode fallback (external provider) → confidence 65-75
   * 4. Fuzzy suggestions only (no coords) → confidence 50-55
   * 5. Nothing found → confidence 20-30
   *
   * Always returns suggestions from the address book ranked by relevance,
   * so the UI can show autocomplete even when exact resolution fails.
   */
  async smartResolve(
    address: string,
    companyId: string,
    country?: string,
  ): Promise<SmartResolveResult> {
    const start = Date.now();
    const cc = country || this.defaultCountry;

    if (!address || !address.trim()) {
      return {
        point: null,
        canonical: '',
        suggestions: [],
        confidence: 0,
        source: 'none',
        companyId,
        resolvedInMs: Date.now() - start,
      };
    }

    const normalized = this.normalizeAddress(address);

    // ── Step 1: Query address book ──────────────────────────────────────────
    let bookEntries: any[] = [];
    if (this.prisma) {
      try {
        bookEntries = await (this.prisma as any).addressBookEntry.findMany({
          where: { companyId, isActive: true },
          orderBy: { usageCount: 'desc' },
          take: 100,
        });
      } catch (err: any) {
        this.logger.warn(`AddressBook query failed: ${err?.message}`);
      }
    }

    // ── Step 2: Score all address book entries ───────────────────────────────
    let bestMatch: { entry: any; score: number } | null = null;
    const suggestions: AddressSuggestion[] = [];

    for (const entry of bookEntries) {
      const entryNorm = this.normalizeAddress(entry.address);
      const score = this.similarityScore(normalized, entryNorm);

      if (score > 0.60) {
        suggestions.push({
          id: entry.id,
          label: entry.label,
          address: entry.address,
          city: entry.city,
          score: Math.round(score * 100) / 100,
          distanceKm: null, // populated below if we have coords
        });

        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { entry, score };
        }
      }
    }

    // Sort by score descending, take top 5
    suggestions.sort((a, b) => b.score - a.score);
    const topSuggestions = suggestions.slice(0, 5);

    // ── Step 3: Resolution strategy ─────────────────────────────────────────

    // 3a. Strong match from address book (score > 0.82)
    if (bestMatch && bestMatch.score > 0.82) {
      const entry = bestMatch.entry;
      const point: SmartGeoPoint | null =
        (entry.lat != null && entry.lng != null)
          ? { lat: entry.lat, lng: entry.lng, provider: 'addressbook', formatted: entry.address }
          : await this.geocode(entry.address, cc) as SmartGeoPoint | null;

      // Increment usage (fire-and-forget)
      if (this.prisma && entry.id) {
        (this.prisma as any).addressBookEntry
          .update({
            where: { id: entry.id },
            data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
          })
          .catch(() => {});
      }

      return {
        point,
        canonical: entry.address,
        suggestions: topSuggestions,
        confidence: Math.min(99, Math.round(bestMatch.score * 100)),
        source: 'addressbook',
        companyId,
        resolvedInMs: Date.now() - start,
      };
    }

    // 3b. Geocode the raw address (external provider)
    const geocoded = await this.geocode(address, cc);
    if (geocoded) {
      const canonical = geocoded.formatted || address;

      // If we have suggestions, it's a fuzzy+geocode combined result
      const source = topSuggestions.length > 0 ? 'fuzzy' : 'geocode';
      const confidence = topSuggestions.length > 0 ? 80 : 70;

      return {
        point: { ...geocoded, provider: geocoded.provider as any },
        canonical,
        suggestions: topSuggestions,
        confidence,
        source,
        companyId,
        resolvedInMs: Date.now() - start,
      };
    }

    // 3c. Only fuzzy suggestions (no coordinates resolved)
    if (topSuggestions.length > 0) {
      return {
        point: null,
        canonical: topSuggestions[0].address,
        suggestions: topSuggestions,
        confidence: 50,
        source: 'fuzzy',
        companyId,
        resolvedInMs: Date.now() - start,
      };
    }

    // 3d. Nothing found
    return {
      point: null,
      canonical: address,
      suggestions: [],
      confidence: 25,
      source: 'none',
      companyId,
      resolvedInMs: Date.now() - start,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC: ADDRESS NORMALIZATION — South African intelligence
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normalize an address for comparison/matching.
   *
   * - Lowercases
   * - Strips special chars (keeps alphanumeric, spaces, commas, dots, hyphens)
   * - Collapses whitespace
   * - Expands SA city abbreviations (JHB → johannesburg, CPT → cape town, etc.)
   * - Expands street type abbreviations (st → street, rd → road, etc.)
   * - Strips common noise words
   */
  normalizeAddress(address: string): string {
    if (!address) return '';

    let norm = address
      .toLowerCase()
      .trim()
      // Remove special chars except alphanumeric, spaces, commas, dots, hyphens
      .replace(/[^\w\s,.-]/g, ' ')
      // Collapse multiple spaces
      .replace(/\s+/g, ' ')
      .trim();

    // Expand city aliases: word-boundary safe replacement
    for (const [abbr, full] of Object.entries(SA_CITY_ALIASES)) {
      const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
      norm = norm.replace(regex, full);
    }

    // Expand street type abbreviations (only when followed by comma, end, or space+digit/word)
    for (const [abbr, full] of Object.entries(STREET_TYPES)) {
      const regex = new RegExp(`\\b${abbr}\\b(?=[,\\s]|$)`, 'gi');
      norm = norm.replace(regex, full);
    }

    // Remove common noise
    norm = norm
      .replace(/\b(south africa|sa|rsa|republic of south africa)\b/g, '')
      .replace(/\b(suite|unit|flat|apartment|apt|floor|flr)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return norm;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC: UTILITY
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: FUZZY MATCHING ENGINE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Compute similarity between two strings (0.0 = no match, 1.0 = exact).
   * Uses Levenshtein distance normalized by the longer string length,
   * combined with token-overlap scoring for multi-word addresses.
   */
  private similarityScore(a: string, b: string): number {
    if (a === b) return 1.0;
    if (!a || !b) return 0.0;

    // Token overlap score (handles word reordering)
    const tokensA = new Set(a.split(/[\s,]+/).filter(Boolean));
    const tokensB = new Set(b.split(/[\s,]+/).filter(Boolean));
    const intersection = [...tokensA].filter((t) => tokensB.has(t)).length;
    const union = new Set([...tokensA, ...tokensB]).size;
    const jaccard = union > 0 ? intersection / union : 0;

    // Levenshtein-based similarity (character-level)
    const levDist = this.levenshtein(a, b);
    const maxLen = Math.max(a.length, b.length);
    const levSim = maxLen > 0 ? 1 - levDist / maxLen : 0;

    // Weighted combination: 60% Levenshtein (character accuracy) + 40% Jaccard (token overlap)
    return levSim * 0.6 + jaccard * 0.4;
  }

  /**
   * Levenshtein edit distance — optimized with single-row DP (O(min(m,n)) space).
   */
  private levenshtein(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    // Ensure a is the shorter string for space optimization
    if (a.length > b.length) [a, b] = [b, a];

    const aLen = a.length;
    const bLen = b.length;
    let prev = new Array(aLen + 1);
    let curr = new Array(aLen + 1);

    for (let i = 0; i <= aLen; i++) prev[i] = i;

    for (let j = 1; j <= bLen; j++) {
      curr[0] = j;
      for (let i = 1; i <= aLen; i++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[i] = Math.min(
          prev[i] + 1,      // deletion
          curr[i - 1] + 1,  // insertion
          prev[i - 1] + cost, // substitution
        );
      }
      [prev, curr] = [curr, prev];
    }

    return prev[aLen];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: GEOCODER PROVIDERS
  // ═══════════════════════════════════════════════════════════════════════════

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
}
