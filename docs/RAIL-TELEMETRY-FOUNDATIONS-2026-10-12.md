# Telemetry Foundations (Phase 3) — Delivered

**Date:** 2026-10-12 · **Mandate:** "world class 100 times better than my competitors"
**Track:** Live wagon/loco tracking — the visible differentiator every logistics
platform claims and few deliver on a private rail network.

## What shipped

### Device registry with real credential hygiene
- `RailDevice` (`WT-000123`-style codes): kind (wagon tracker / loco telematics /
  waybill scanner / port scanner), wagon/loco binding, per-device speed & battery
  thresholds, status (ACTIVE/INACTIVE/FAULTY).
- **Ingest tokens are stored only as SHA-256 hashes** (like passwords): the
  plaintext is shown exactly once at registration or rotation — nothing can leak
  it later. Rotation is self-service in the UI.

### Ingestion — the same contract an MQTT bridge will use
- `POST /rail/telemetry/ingest` + `X-Device-Token` (no user account needed on the
  hardware side), batch up to 500 points; every point runs through the pure
  validator before it can touch the map (bad coordinates, future timestamps past
  clock skew, fossils >90 days, nonsense sensor readings all refused with reasons).
- `POST /rail/telemetry/ingest/bulk` (JWT, RAIL_WRITE) for integrations — each
  point names its `deviceCode`.
- Last-known-position snapshot kept per device; time-series points indexed
  `(deviceId, recordedAt)` + `(companyId, recordedAt)`.

### Intelligence, deterministically (pure rules + tests)
- **Distance**: haversine over the trail (Johannesburg→Sishen sanity-checked at
  ~543 km straight-line).
- **Health alerts raised on ingest**: SPEED_EXCEEDED / BATTERY_LOW against
  per-device thresholds (platform defaults 85 kph / 15%), **deduplicated within
  a 30-minute window** so sensor jitter can't spam the console. DEVICE_SILENT
  (>6 h without a report) is computed on read. Alerts flow through the **outbox**
  (`rail.telemetry.alert_raised|alert_updated`) like every other rail event —
  webhook subscribers get them free.

### UI — "Live Tracking" tab in Rail Ops Console
- Device table with health signals: status pill, **silent badge**, last seen,
  live speed/battery, open-alert counts.
- **Map** (OpenStreetMap, dark-UI markers) with all device positions + the
  selected device's trail polyline; auto-fit bounds.
- **Movement summary strip**: distance 24 h, max/avg speed, point count, freshness.
- **Alert queue** with Acknowledge / Resolve (audit-trail + webhook on both).
- Polls every 15 s — honest freshness without inventing socket infrastructure.

### Events & audit
- Event catalog now **28 names** (added `rail.telemetry.device_registered`,
  `device_status_changed`, `alert_raised`, `alert_updated`) — selectable in
  Settings → Integrations.
- Audit actions: device registered/updated/token-rotated, alert acknowledged/resolved.

## Gates
| | |
|---|---|
| Backend | **2,092/2,092** (67 suites — +12 telemetry rules tests) |
| Frontend | **770/770** (32 files — +5 Live Tracking panel tests) |
| tsc / eslint / builds | clean both sides (0 errors) |

## Deploy notes
- Migration `20261012120000_rail_telemetry` (**12th**) applies via `./deploy/vps-deploy.sh`.
- The complete chain is now: **slot application → possession → train manifest →
  weighbridge → telemetry (live) → daily handshake → dispute**, with the outbox
  as the integration backbone end to end.

## Where this beats the market (deliberately)
1. Credential hygiene on device ingest (hashed tokens, once-shown plaintext, rotation) — most rail dashboards ship shared API keys.
2. Refuse-not-repair ingestion: a bad point is rejected with reasons, never silently "fixed".
3. Alerts with dedupe windows + acknowledge/resolve lifecycle — operations-grade, not dashboard confetti.
4. Everything events out through one outbox → webhooks; integrators don't need our database.
