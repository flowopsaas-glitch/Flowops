import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { ScanLine, Package, Truck, CheckCircle2, AlertTriangle, Loader2, ArrowRight } from "lucide-react";
import api from "../api/client";
import BarcodeQrScanner from "../components/BarcodeQrScanner";

interface WaybillEntry {
  waybill: {
    id: string;
    trackingNumber: string;
    recipientName: string;
    recipientAddress: string;
    weight: number;
    status: string;
  };
}

interface ManifestData {
  id: string;
  code: string;
  driver: { id: string; name: string; vehicleReg: string } | null;
  branch: { id: string; name: string } | null;
  waybills: WaybillEntry[];
}

interface ScanResult {
  status: "VERIFIED" | "NOT_FOUND" | "NOT_ON_MANIFEST";
  trackingNumber: string;
  waybillId?: string;
  recipientName?: string;
}

export default function LoadScan() {
  const { id } = useParams<{ id: string }>();
  const [manifest, setManifest] = useState<ManifestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completionResult, setCompletionResult] = useState<{ loaded: number; totalExpected: number; unscanned: { trackingNumber: string; recipientName?: string }[] } | null>(null);
  const [showConfirmComplete, setShowConfirmComplete] = useState(false);

  const fetchManifest = useCallback(() => (async () => {
    if (!id) return;
    try {
      const res = await api.get(`/manifests/${id}/load-scan`);
      setManifest(res.data);
    } catch (err) {
      console.error("Failed to load manifest", err);
    } finally {
      setLoading(false);
    }
  })(), [id]);

  useEffect(() => {
    fetchManifest();
  }, [fetchManifest]);

  const handleScan = async (trackingNumber: string) => {
    if (!id || !trackingNumber.trim()) return;
    setScanning(true);
    setLastScan(null);
    try {
      const res = await api.post(`/manifests/${id}/load-scan/verify`, {
        trackingNumber: trackingNumber.trim(),
      });
      setLastScan(res.data);
      // Refresh manifest data to update statuses
      await fetchManifest();
    } catch (err) {
      console.error("Scan failed", err);
      setLastScan({ status: "NOT_FOUND", trackingNumber: trackingNumber.trim() });
    } finally {
      setScanning(false);
      setManualInput("");
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleScan(manualInput);
  };

  const handleCompleteLoading = async () => {
    if (!id) return;
    setCompleting(true);
    try {
      const res = await api.post(`/manifests/${id}/load-scan/complete`);
      setCompletionResult(res.data);
    } catch (err) {
      console.error("Complete loading failed", err);
    } finally {
      setCompleting(false);
      setShowConfirmComplete(false);
    }
  };

  const loadedCount =
    manifest?.waybills.filter((mw) => mw.waybill.status === "IN_TRANSIT").length ?? 0;
  const totalCount = manifest?.waybills.length ?? 0;
  const unscannedWaybills =
    manifest?.waybills.filter((mw) => mw.waybill.status !== "IN_TRANSIT") ?? [];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
          <p className="text-white/70 text-lg">Manifest not found</p>
        </div>
      </div>
    );
  }

  if (completionResult) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-8 text-center">
          <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto mb-4" />
          <h2 className="text-2xl font-black text-white mb-2">Loading Complete</h2>
          <p className="text-white/60 mb-6">Manifest dispatched successfully</p>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="rounded-2xl bg-white/[0.05] p-4">
              <p className="text-xs text-white/40 uppercase tracking-wider">Loaded</p>
              <p className="text-2xl font-black text-green-400">{completionResult.loaded}</p>
            </div>
            <div className="rounded-2xl bg-white/[0.05] p-4">
              <p className="text-xs text-white/40 uppercase tracking-wider">Expected</p>
              <p className="text-2xl font-black text-white">{completionResult.totalExpected}</p>
            </div>
          </div>
          {completionResult.unscanned.length > 0 && (
            <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-4 text-left">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                <p className="text-sm font-bold text-yellow-400">
                  {completionResult.unscanned.length} Unscanned Parcels
                </p>
              </div>
              <div className="space-y-2">
                {completionResult.unscanned.map((item) => (
                  <div key={item.trackingNumber} className="flex items-center justify-between text-sm">
                    <span className="text-white/70 font-mono">{item.trackingNumber}</span>
                    <span className="text-white/50">{item.recipientName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <ScanLine className="w-7 h-7 text-blue-400" />
            Route Load &amp; Scan
          </h1>
          <p className="text-sm text-white/50 mt-1">Verify each parcel as it&apos;s loaded onto the vehicle</p>
        </div>
      </div>

      {/* Manifest Info */}
      <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider">Manifest</p>
            <p className="text-sm font-bold text-white mt-1">{manifest.code}</p>
          </div>
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider">Driver</p>
            <p className="text-sm font-bold text-white mt-1">{manifest.driver?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider">Vehicle</p>
            <p className="text-sm font-bold text-white mt-1">{manifest.driver?.vehicleReg ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider">Branch</p>
            <p className="text-sm font-bold text-white mt-1">{manifest.branch?.name ?? "—"}</p>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-400" />
            <span className="text-sm font-bold text-white">Loading Progress</span>
          </div>
          <span className="text-lg font-black text-white">
            <span className="text-green-400">{loadedCount}</span>/{totalCount} parcels loaded
          </span>
        </div>
        <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-green-400 transition-all duration-500"
            style={{ width: totalCount > 0 ? `${(loadedCount / totalCount) * 100}%` : "0%" }}
          />
        </div>
      </div>

      {/* Scanner */}
      <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <ScanLine className="w-5 h-5 text-blue-400" />
          <h3 className="text-sm font-bold text-white">Scan Parcel</h3>
        </div>

        <BarcodeQrScanner onDetected={handleScan} />

        <form onSubmit={handleManualSubmit} className="flex gap-3">
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Or type tracking number..."
            className="flex-1 rounded-2xl bg-white/[0.05] border border-white/10 px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50"
          />
          <button
            type="submit"
            disabled={scanning || !manualInput.trim()}
            className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold text-white hover:bg-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Verify
          </button>
        </form>

        {/* Last Scan Result */}
        {lastScan && (
          <div
            className={`rounded-2xl p-4 flex items-center gap-3 ${
              lastScan.status === "VERIFIED"
                ? "bg-green-500/10 border border-green-500/30"
                : lastScan.status === "NOT_ON_MANIFEST"
                ? "bg-yellow-500/10 border border-yellow-500/30"
                : "bg-red-500/10 border border-red-500/30"
            }`}
          >
            {lastScan.status === "VERIFIED" ? (
              <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0" />
            )}
            <div>
              <p className="text-sm font-bold text-white">
                {lastScan.status === "VERIFIED" && "Parcel Verified"}
                {lastScan.status === "NOT_FOUND" && "Tracking Number Not Found"}
                {lastScan.status === "NOT_ON_MANIFEST" && "Not On This Manifest"}
              </p>
              <p className="text-xs text-white/50">
                {lastScan.trackingNumber}
                {lastScan.recipientName && ` — ${lastScan.recipientName}`}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Waybill List */}
      <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Truck className="w-5 h-5 text-blue-400" />
          Expected Parcels
        </h3>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {manifest.waybills.map((mw) => (
            <div
              key={mw.waybill.id}
              className={`flex items-center justify-between rounded-2xl px-4 py-3 border ${
                mw.waybill.status === "IN_TRANSIT"
                  ? "border-green-500/20 bg-green-500/5"
                  : "border-white/5 bg-white/[0.02]"
              }`}
            >
              <div className="flex items-center gap-3">
                {mw.waybill.status === "IN_TRANSIT" ? (
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                ) : (
                  <Package className="w-4 h-4 text-white/30" />
                )}
                <div>
                  <p className="text-sm font-mono text-white">{mw.waybill.trackingNumber}</p>
                  <p className="text-xs text-white/50">{mw.waybill.recipientName}</p>
                </div>
              </div>
              <span
                className={`text-xs font-bold uppercase tracking-wider ${
                  mw.waybill.status === "IN_TRANSIT" ? "text-green-400" : "text-white/30"
                }`}
              >
                {mw.waybill.status === "IN_TRANSIT" ? "Loaded" : "Pending"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Complete Loading */}
      <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6">
        {!showConfirmComplete ? (
          <button
            onClick={() => setShowConfirmComplete(true)}
            className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 py-4 text-sm font-black text-white hover:from-blue-500 hover:to-blue-400 transition flex items-center justify-center gap-3"
          >
            <Truck className="w-5 h-5" />
            Complete Loading &amp; Dispatch
          </button>
        ) : (
          <div className="space-y-4">
            {unscannedWaybills.length > 0 && (
              <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  <p className="text-sm font-bold text-yellow-400">
                    Warning: {unscannedWaybills.length} parcels have not been scanned
                  </p>
                </div>
                <div className="space-y-1">
                  {unscannedWaybills.slice(0, 5).map((mw) => (
                    <p key={mw.waybill.id} className="text-xs text-white/50 font-mono">
                      {mw.waybill.trackingNumber} — {mw.waybill.recipientName}
                    </p>
                  ))}
                  {unscannedWaybills.length > 5 && (
                    <p className="text-xs text-white/30">...and {unscannedWaybills.length - 5} more</p>
                  )}
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmComplete(false)}
                className="flex-1 rounded-2xl border border-white/10 bg-white/[0.05] py-3 text-sm font-bold text-white hover:bg-white/[0.08] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCompleteLoading}
                disabled={completing}
                className="flex-1 rounded-2xl bg-green-600 py-3 text-sm font-black text-white hover:bg-green-500 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Confirm Dispatch
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
