import { useCallback, useEffect, useRef, useState } from "react";
import { X, Camera, Keyboard, CheckCircle2, ScanLine } from "lucide-react";

/**
 * BarcodeScanner — camera-based parcel scanning for the driver PWA.
 *
 * Uses the browser-native BarcodeDetector API (Chrome / Android WebView — what
 * most SA drivers run) for real-time scanning off the live camera feed. On
 * devices without it (older browsers, most iOS Safari), it falls back to a
 * manual entry field so a scan is NEVER a hard blocker on a delivery.
 *
 * Deliberately dependency-free (no heavy WASM barcode libs) to keep the PWA
 * light and fast on low-end phones.
 */

type Props = {
  onScan: (code: string) => void;
  onClose: () => void;
  /** Codes already scanned this session — shown as duplicates guard + tally. */
  alreadyScanned?: string[];
  title?: string;
};

// The BarcodeDetector API isn't in TS's lib yet — declare a minimal shape.
declare global {
  interface Window {
    BarcodeDetector?: any;
  }
}

export default function BarcodeScanner({ onScan, onClose, alreadyScanned = [], title = "Scan parcel" }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);
  const lastCodeRef = useRef<string>("");
  const lastAtRef = useRef<number>(0);

  const [supported, setSupported] = useState<boolean>(false);
  const [manual, setManual] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [lastHit, setLastHit] = useState<string | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const handleHit = useCallback(
    (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      // Debounce identical reads within 1.5s so one parcel doesn't fire twice.
      const now = Date.now();
      if (code === lastCodeRef.current && now - lastAtRef.current < 1500) return;
      lastCodeRef.current = code;
      lastAtRef.current = now;
      setLastHit(code);
      // Light haptic feedback on supported devices.
      try { navigator.vibrate?.(60); } catch { /* ignore */ }
      onScan(code);
    },
    [onScan],
  );

  useEffect(() => {
    const hasApi = typeof window !== "undefined" && "BarcodeDetector" in window;
    setSupported(Boolean(hasApi));
    if (!hasApi) return;

    let cancelled = false;

    (async () => {
      try {
        detectorRef.current = new window.BarcodeDetector({
          formats: ["qr_code", "code_128", "ean_13", "ean_8", "code_39", "upc_a", "upc_e", "itf"],
        });
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const tick = async () => {
          if (cancelled || !videoRef.current || !detectorRef.current) return;
          try {
            const codes = await detectorRef.current.detect(videoRef.current);
            if (codes?.length) handleHit(codes[0].rawValue);
          } catch { /* frame not ready — ignore */ }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e: any) {
        setError(
          e?.name === "NotAllowedError"
            ? "Camera permission denied — enter the barcode manually below."
            : "Camera unavailable — enter the barcode manually below.",
        );
        setSupported(false);
      }
    })();

    return () => { cancelled = true; stop(); };
  }, [handleHit, stop]);

  const submitManual = () => {
    if (!manual.trim()) return;
    handleHit(manual);
    setManual("");
  };

  const close = () => { stop(); onClose(); };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/98 backdrop-blur-2xl flex flex-col p-6">
      <div className="flex items-center justify-between mt-6 mb-6">
        <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white flex items-center gap-2">
          <ScanLine className="text-sky-400" /> {title}
        </h2>
        <button onClick={close} className="p-3 bg-white/5 rounded-full text-white"><X size={20} /></button>
      </div>

      {/* Camera view */}
      {supported ? (
        <div className="relative flex-1 rounded-[32px] overflow-hidden border border-sky-500/30 bg-black">
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          {/* Scan reticle */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-4/5 h-24 rounded-2xl border-2 border-sky-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          {lastHit && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-emerald-500/90 px-4 py-2 text-xs font-black text-black">
              <CheckCircle2 size={16} /> {lastHit}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 rounded-[32px] border border-white/10 bg-white/[0.03] p-8 text-center">
          <Camera className="h-12 w-12 text-white/30" />
          <p className="text-sm text-white/50">{error ?? "Live scanning isn't available on this device. Enter the barcode manually."}</p>
        </div>
      )}

      {/* Manual entry — always available as a fallback so nothing blocks a delivery */}
      <div className="mt-5">
        <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-white/45 mb-2">
          <Keyboard size={14} /> Manual entry
        </label>
        <div className="flex gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitManual()}
            placeholder="Type or paste the barcode / waybill number"
            className="flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder-white/25 outline-none focus:border-sky-500/50"
          />
          <button onClick={submitManual} className="rounded-2xl bg-sky-500 px-5 py-3 font-black text-white active:scale-95">
            Add
          </button>
        </div>
      </div>

      {alreadyScanned.length > 0 && (
        <p className="mt-3 text-center text-[11px] text-white/40">{alreadyScanned.length} scanned this delivery</p>
      )}

      <button onClick={close} className="mt-5 w-full rounded-2xl border border-white/10 bg-white/5 py-4 text-sm font-black uppercase tracking-widest text-white/70">
        Done scanning
      </button>
    </div>
  );
}
