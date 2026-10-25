import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Loader2, Plus, RefreshCw } from "lucide-react";
import {
  acknowledgeAlert, ALERT_KIND_LABEL, createRailDevice, DEVICE_KIND_LABEL, getDevicePoints, getDeviceSummary,
  listRailDevices, listTelemetryAlerts, resolveAlert, rotateDeviceToken,
  type RailAlertKind, type RailDevice, type TelemetryAlert, type TelemetryPoint, type TelemetrySummary,
} from "../../api/railTelemetryApi";
import { useToast } from "../../components/toast-context";
import { Banner, Field, Modal, Pill, Section, btnNeutral, btnPrimary, inputCls } from "./railUi";
import type { Tone } from "../../lib/railSlot";
import RailTelemetryMap from "./RailTelemetryMap";

/**
 * Live Tracking — telemetry foundations panel.
 *
 * Device registry (token shown once), live positions on the map, movement
 * summaries (haversine distance over the trail), and the health-alert queue.
 * Polls every 15 seconds; the map renders whatever the API last returned.
 */

const POLL_MS = 15_000;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

const STATUS_TONE: Record<RailDevice["status"], Tone> = { ACTIVE: "ok", INACTIVE: "muted", FAULTY: "danger" };
const ALERT_TONE: Record<RailAlertKind, Tone> = {
  SPEED_EXCEEDED: "danger", BATTERY_LOW: "warn", DEVICE_SILENT: "warn", TEMPERATURE: "warn",
};

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

export default function LiveTrackingPanel({ canWrite }: { canWrite: boolean }) {
  const { showToast } = useToast();
  const [devices, setDevices] = useState<RailDevice[]>([]);
  const [alerts, setAlerts] = useState<TelemetryAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [trail, setTrail] = useState<TelemetryPoint[]>([]);
  const [summary, setSummary] = useState<TelemetrySummary | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [tokenOnce, setTokenOnce] = useState<{ code: string; token: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newWagon, setNewWagon] = useState("");

  const load = useCallback(() => (async () => {
    const [devicesResult, alertsResult] = await Promise.allSettled([
      listRailDevices(),
      listTelemetryAlerts(),
    ]);
    if (devicesResult.status === "fulfilled") {
      setDevices(devicesResult.value);
      setDevicesError(null);
    } else {
      setDevicesError(errorMessage(devicesResult.reason));
    }
    if (alertsResult.status === "fulfilled") {
      setAlerts(alertsResult.value);
      setAlertsError(null);
    } else {
      setAlertsError(errorMessage(alertsResult.reason));
    }
    setLoading(false);
  })(), []);

  // When the selection changes, the previous device's detail is stale.
  // Adjust it during render (React's documented pattern for prop/state
  // transitions) instead of clearing it synchronously in the fetch effect.
  const [detailSelection, setDetailSelection] = useState<string | null>(null);
  if (selected !== detailSelection) {
    setDetailSelection(selected);
    setTrail([]);
    setSummary(null);
    setDetailError(null);
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    const fetchDetail = async () => {
      const [pointsResult, summaryResult] = await Promise.allSettled([
        getDevicePoints(selected, { limit: 200 }),
        getDeviceSummary(selected, 24),
      ]);
      if (!alive) return;
      if (pointsResult.status === "fulfilled" && summaryResult.status === "fulfilled") {
        setTrail(pointsResult.value.slice().reverse()); // oldest → newest for the polyline
        setSummary(summaryResult.value);
        setDetailError(null);
      } else {
        setTrail([]);
        setSummary(null);
        const reason = pointsResult.status === "rejected" ? pointsResult.reason : summaryResult.status === "rejected" ? summaryResult.reason : "Unknown error";
        setDetailError(errorMessage(reason));
      }
    };
    void fetchDetail();
    const t = setInterval(fetchDetail, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [selected]);

  const create = async () => {
    if (!newCode.trim()) return;
    setShowNew(false);
    setBusy("create");
    try {
      const r = await createRailDevice({
        deviceCode: newCode.trim().toUpperCase(),
        label: newLabel.trim() || undefined,
        wagonNumber: newWagon.trim() || undefined,
      });
      setTokenOnce({ code: r.device.deviceCode, token: r.ingestToken });
      showToast(`Device ${r.device.deviceCode} registered.`, "success");
      setNewCode(""); setNewLabel(""); setNewWagon("");
      await load();
    } catch (e) {
      showToast(`Could not register device: ${(e as Error)?.message ?? e}`, "error");
    } finally {
      setBusy(null);
    }
  };

  const rotate = async (id: string) => {
    setBusy(`rotate-${id}`);
    try {
      const r = await rotateDeviceToken(id);
      setTokenOnce({ code: r.device.deviceCode, token: r.ingestToken });
      showToast("Ingest token rotated — update the device configuration.", "success");
      await load();
    } catch (e) {
      showToast(`Rotation failed: ${(e as Error)?.message ?? e}`, "error");
    } finally {
      setBusy(null);
    }
  };

  const actOnAlert = async (id: string, action: "ack" | "resolve") => {
    setBusy(`${action}-${id}`);
    try {
      if (action === "ack") await acknowledgeAlert(id);
      else await resolveAlert(id);
      showToast(action === "ack" ? "Alert acknowledged." : "Alert resolved.", "success");
      await load();
    } catch (e) {
      showToast(`${action} failed: ${(e as Error)?.message ?? e}`, "error");
    } finally {
      setBusy(null);
    }
  };

  const copyToken = async () => {
    if (!tokenOnce) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable in this browser.");
      await navigator.clipboard.writeText(tokenOnce.token);
      showToast("Token copied to clipboard.", "success");
    } catch (error: unknown) {
      showToast(`Could not copy token: ${errorMessage(error)} Select and copy it manually.`, "error");
    }
  };

  const mapDevices = devices
    .filter((d) => d.lastLat != null && d.lastLng != null)
    .map((d) => ({ id: d.id, deviceCode: d.deviceCode, label: d.label, lat: d.lastLat!, lng: d.lastLng!, silent: d.silent }));
  const selectedDevice = devices.find((d) => d.id === selected) ?? null;

  if (loading) {
    return <div className="flex items-center gap-2 py-10 text-slate-300"><Loader2 className="h-5 w-5 animate-spin" /> Loading telemetry…</div>;
  }

  return (
    <div className="space-y-5">
      {tokenOnce && (
        <Modal title={`Ingest token for ${tokenOnce.code}`} onClose={() => setTokenOnce(null)}>
          <Banner tone="warn" title="Shown once">
            Store this token in the device configuration now. FlowOps keeps only its hash — it cannot be shown again (you can rotate a new one).
          </Banner>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-emerald-300">{tokenOnce.token}</code>
            <button type="button" className={btnNeutral} onClick={() => void copyToken()}>
              <Copy className="h-4 w-4" /> Copy
            </button>
          </div>
        </Modal>
      )}

      <Section title="Live tracking" right={
        <div className="flex gap-2">
          {canWrite && (
            <button type="button" className={btnPrimary} onClick={() => setShowNew(true)}><Plus className="h-4 w-4" /> Register device</button>
          )}
          <button type="button" className={btnNeutral} onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Refresh</button>
        </div>
      }>
        {devicesError && (
          <div role="alert" className="mb-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-200">
            Could not refresh the device registry: {devicesError}. Any previously loaded device information may be stale.
          </div>
        )}
        {detailError && selected && (
          <div role="alert" className="mb-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-200">
            Could not load selected device positions and movement summary: {detailError}.
          </div>
        )}
        {mapDevices.length === 0 && trail.length === 0 ? (
          <div className="py-6 text-sm text-slate-400">
            {devicesError
              ? "Position state cannot be verified because the device registry could not be loaded."
              : detailError && selected
                ? "The selected device's position state could not be verified; this is not an empty-position result."
                : <>No positions yet. Register a device, then post points to <code className="text-emerald-300">POST /rail/telemetry/ingest</code> with its <code>X-Device-Token</code> — or use the bulk ingest from an integration.</>}
          </div>
        ) : (
          <RailTelemetryMap
            devices={mapDevices}
            trail={trail.map((p) => ({ lat: p.lat, lng: p.lng, recordedAt: p.recordedAt }))}
            trailLabel={selectedDevice ? `${selectedDevice.deviceCode}${selectedDevice.label ? ` — ${selectedDevice.label}` : ""}` : undefined}
          />
        )}

        {summary && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["Distance 24h", `${summary.distanceKm} km`],
              ["Max speed", summary.maxSpeedKph != null ? `${summary.maxSpeedKph} kph` : "—"],
              ["Avg speed", summary.avgSpeedKph != null ? `${summary.avgSpeedKph} kph` : "—"],
              ["Points", String(summary.pointCount)],
              ["Last seen", ago(summary.lastSeenAt)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
                <div className="text-sm font-semibold text-white">{value}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Devices (${devices.length})`}>
        {devices.length === 0 && devicesError ? (
          <div role="alert" className="py-4 text-sm text-rose-300">Device registry unavailable: {devicesError}</div>
        ) : devices.length === 0 ? (
          <div className="py-4 text-sm text-slate-400">No devices registered yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label="Registered telemetry devices" className="min-w-[760px] w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-4">Device</th>
                  <th className="py-2 pr-4">Kind</th>
                  <th className="py-2 pr-4">Wagon / Loco</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Last seen</th>
                  <th className="py-2 pr-4">Speed</th>
                  <th className="py-2 pr-4">Battery</th>
                  <th className="py-2 pr-4">Alerts</th>
                  {canWrite && <th className="py-2">Token</th>}
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr
                    key={d.id}
                    className={`border-b border-white/5 hover:bg-white/[0.03] ${selected === d.id ? "bg-white/[0.05]" : ""}`}
                  >
                    <td className="py-2 pr-4">
                      <button
                        type="button"
                        aria-pressed={selected === d.id}
                        aria-label={`${selected === d.id ? "Hide" : "Show"} positions for ${d.deviceCode}`}
                        onClick={() => setSelected(selected === d.id ? null : d.id)}
                        className="rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                      >
                        <span className="block font-mono text-white">{d.deviceCode}</span>
                        {d.label && <span className="block text-xs text-slate-400">{d.label}</span>}
                      </button>
                    </td>
                    <td className="py-2 pr-4 text-slate-300">{DEVICE_KIND_LABEL[d.kind]}</td>
                    <td className="py-2 pr-4 text-slate-300">{d.wagonNumber || d.locoReference || "—"}</td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-1">
                        <Pill tone={STATUS_TONE[d.status]}>{d.status}</Pill>
                        {d.silent && <Pill tone="warn">silent</Pill>}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-slate-300">{ago(d.lastSeenAt)}</td>
                    <td className="py-2 pr-4 text-slate-300">{d.lastSpeedKph != null ? `${Math.round(d.lastSpeedKph)} kph` : "—"}</td>
                    <td className="py-2 pr-4 text-slate-300">{d.lastBatteryPct != null ? `${Math.round(d.lastBatteryPct)}%` : "—"}</td>
                    <td className="py-2 pr-4">
                      {d.openAlerts > 0 ? <Pill tone="danger">{d.openAlerts} open</Pill> : <span className="text-slate-500">—</span>}
                    </td>
                    {canWrite && (
                      <td className="py-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white"
                          disabled={busy === `rotate-${d.id}`}
                          onClick={(e) => { e.stopPropagation(); void rotate(d.id); }}
                        >
                          <KeyRound className="h-3.5 w-3.5" /> {`••${d.tokenPrefix}`}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={`Health alerts (${alerts.length})`}>
        {alertsError && (
          <div role="alert" className="mb-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-200">
            Could not refresh health alerts: {alertsError}. Any previously loaded alerts may be stale.
          </div>
        )}
        {alerts.length === 0 && !alertsError ? (
          <div className="py-4 text-sm text-slate-400">No open alerts. Speed, battery and silence thresholds are checked on every ingest.</div>
        ) : alerts.length === 0 ? null : (
          <div className="space-y-2">
            {alerts.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 px-3 py-2">
                <Pill tone={ALERT_TONE[a.kind]}>{ALERT_KIND_LABEL[a.kind]}</Pill>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white">{a.message}</div>
                  <div className="text-xs text-slate-400">
                    {a.device?.deviceCode ?? a.deviceId} · raised {ago(a.raisedAt)}
                    {a.acknowledgedBy ? ` · ack by ${a.acknowledgedBy}` : ""}
                  </div>
                </div>
                {canWrite && a.status === "OPEN" && (
                  <button type="button" className={btnNeutral} disabled={busy === `ack-${a.id}`} onClick={() => void actOnAlert(a.id, "ack")}>Acknowledge</button>
                )}
                {canWrite && a.status !== "RESOLVED" && (
                  <button type="button" className={btnPrimary} disabled={busy === `resolve-${a.id}`} onClick={() => void actOnAlert(a.id, "resolve")}>Resolve</button>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {showNew && (
        <Modal title="Register telemetry device" onClose={() => setShowNew(false)}>
          <div className="space-y-3">
            <Field label="Device code (what the hardware identifies as — e.g. WT-000123)">
              <input className={inputCls} value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="WT-000123" />
            </Field>
            <Field label="Label (optional)">
              <input className={inputCls} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Ore rake, wagon 14" />
            </Field>
            <Field label="Wagon number (optional)">
              <input className={inputCls} value={newWagon} onChange={(e) => setNewWagon(e.target.value)} placeholder="SAR-064213" />
            </Field>
          </div>
          <div className="mt-4 flex gap-2">
            <button className={btnPrimary} disabled={!newCode.trim() || busy === "create"} onClick={() => void create()}>
              {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Register
            </button>
            <button className={btnNeutral} onClick={() => setShowNew(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
