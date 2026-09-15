import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';

/**
 * AISStream live vessel feed.
 *
 * AISStream.io (https://aisstream.io) streams global AIS data over a single
 * long-lived WebSocket — it is NOT a request/response REST API. So we hold ONE
 * connection open, subscribe to the vessels (MMSIs) we care about, and cache
 * each vessel's latest position in memory. Callers (VesselTrackingService) then
 * read the cache instantly — no per-request socket, no paid REST calls.
 *
 * Design principles:
 *  - The API key lives ONLY in env (AISSTREAM_API_KEY). Never in code/DB.
 *  - If the key is absent, the service is a silent no-op — the platform runs
 *    exactly as before (honest degradation, never a crash).
 *  - Auto-reconnect with capped backoff; re-subscribes on every (re)connect.
 *  - We track vessels by MMSI. IMO/name → MMSI resolution happens upstream;
 *    this service only needs the MMSI list.
 *  - Positions carry a timestamp so the UI can show freshness and mark stale
 *    data honestly rather than pretending a week-old fix is "live".
 */

export interface LiveVesselPosition {
  mmsi: string;
  lat: number;
  lng: number;
  speed: number;   // knots (SOG)
  heading: number; // degrees (COG or true heading)
  shipName?: string;
  receivedAt: number; // epoch ms when WE received it
}

const AIS_WS_URL = 'wss://stream.aisstream.io/v0/stream';
// Broad bounding box covering the trade lanes FlowOps' ports sit on:
// Africa + Europe approaches + Middle East + South/East Asia. AISStream
// requires a BoundingBoxes array; we additionally filter by MMSI server-side.
const TRADE_LANES_BBOX: number[][][] = [
  [[-40, -40], [130, 60]], // [[swLng,swLat],[neLng,neLat]] roughly Atlantic-Africa → East Asia
];

@Injectable()
export class AisStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('AISStream');
  private ws: WebSocket | null = null;
  private apiKey: string | undefined;
  private enabled = false;
  private closing = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  /** MMSIs we currently want positions for. */
  private readonly tracked = new Set<string>();
  /** Latest known position per MMSI. */
  private readonly positions = new Map<string, LiveVesselPosition>();

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.apiKey = this.config.get<string>('AISSTREAM_API_KEY') || process.env.AISSTREAM_API_KEY;
    if (!this.apiKey) {
      this.logger.warn('AISSTREAM_API_KEY not set — live vessel tracking disabled (platform runs normally).');
      return;
    }
    this.enabled = true;
    this.connect();
  }

  onModuleDestroy() {
    this.closing = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try { this.ws?.close(); } catch { /* ignore */ }
  }

  /** Is the live feed active (key present + socket open)? */
  isLive(): boolean {
    return this.enabled && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Register vessels to track by MMSI. Re-sends the subscription so the feed
   * narrows to just these vessels. Ignored if the feed is disabled.
   */
  trackVessels(mmsis: string[]): void {
    if (!this.enabled) return;
    let changed = false;
    for (const raw of mmsis) {
      const mmsi = String(raw ?? '').trim();
      if (/^\d{7,9}$/.test(mmsi) && !this.tracked.has(mmsi)) {
        this.tracked.add(mmsi);
        changed = true;
      }
    }
    if (changed && this.ws?.readyState === WebSocket.OPEN) this.sendSubscription();
  }

  /** Latest cached position for a vessel, or null if we've never seen it. */
  getPosition(mmsi: string): LiveVesselPosition | null {
    return this.positions.get(String(mmsi ?? '').trim()) ?? null;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private connect(): void {
    if (this.closing || !this.enabled) return;
    try {
      // perMessageDeflate is required by AISStream to serve full bandwidth.
      this.ws = new WebSocket(AIS_WS_URL, { perMessageDeflate: true });
    } catch (err: any) {
      this.logger.error(`AIS socket construct failed: ${err?.message}`);
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      this.reconnectAttempts = 0;
      this.logger.log('AIS stream connected.');
      this.sendSubscription();
    });

    this.ws.on('message', (data: WebSocket.RawData) => this.handleMessage(data));

    this.ws.on('error', (err: any) => {
      this.logger.warn(`AIS stream error: ${err?.message ?? err}`);
    });

    this.ws.on('close', () => {
      if (this.closing) return;
      this.logger.warn('AIS stream closed — reconnecting.');
      this.scheduleReconnect();
    });
  }

  private sendSubscription(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.apiKey) return;
    // AISStream requires BoundingBoxes. We also pass FiltersShipMMSI when we
    // have specific vessels, and restrict to position reports to keep volume low.
    const sub: Record<string, any> = {
      Apikey: this.apiKey,
      BoundingBoxes: TRADE_LANES_BBOX,
      FilterMessageTypes: ['PositionReport'],
    };
    if (this.tracked.size > 0) {
      sub.FiltersShipMMSI = Array.from(this.tracked);
    }
    try {
      this.ws.send(JSON.stringify(sub));
      this.logger.log(`AIS subscription sent (${this.tracked.size} vessel(s) filtered).`);
    } catch (err: any) {
      this.logger.warn(`AIS subscription send failed: ${err?.message}`);
    }
  }

  private handleMessage(data: WebSocket.RawData): void {
    let msg: any;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    // AISStream error frames arrive as { error: "..." } — surface auth issues clearly.
    if (msg?.error) {
      this.logger.warn(`AIS stream message error: ${msg.error}`);
      return;
    }

    // AISStream sends MessageType "PositionReport"; be tolerant of casing variants.
    const mt = String(msg?.MessageType ?? '');
    if (mt !== 'PositionReport' && mt.toUpperCase() !== 'POSITION_REPORT') return;

    const meta = msg.MetaData ?? msg.Metadata ?? {};
    const report = msg.Message?.PositionReport ?? msg.Message?.positionReport ?? {};
    const mmsi = String(meta.MMSI ?? meta.mmsi ?? report.UserID ?? '').trim();
    if (!mmsi) return;

    const lat = Number(meta.latitude ?? meta.Latitude ?? report.Latitude);
    const lng = Number(meta.longitude ?? meta.Longitude ?? report.Longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    this.positions.set(mmsi, {
      mmsi,
      lat,
      lng,
      speed: Number(report.Sog ?? 0) || 0,
      heading: Number(report.Cog ?? report.TrueHeading ?? 0) || 0,
      shipName: String(meta.ShipName ?? meta.shipName ?? '').trim() || undefined,
      receivedAt: Date.now(),
    });
  }

  private scheduleReconnect(): void {
    if (this.closing || !this.enabled) return;
    try { this.ws?.removeAllListeners(); } catch { /* ignore */ }
    this.ws = null;
    // Exponential backoff capped at 60s.
    const delay = Math.min(60_000, 2_000 * 2 ** Math.min(this.reconnectAttempts, 5));
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}
