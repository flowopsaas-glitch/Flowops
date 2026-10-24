import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from "@zxing/library";

// Accept both `onDetected` and legacy `onScan` for backward compatibility.
type Props = {
  onDetected?: (value: string) => void;
  onScan?: (value: string) => void;
  className?: string;
};

function inputBase() {
  return "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400";
}

export default function BarcodeQrScanner({ onDetected, onScan, className }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const hints = useMemo(() => {
    const map = new Map();
    map.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.QR_CODE,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.ITF,
      BarcodeFormat.PDF_417,
      BarcodeFormat.DATA_MATRIX,
    ]);
    map.set(DecodeHintType.TRY_HARDER, true);
    return map;
  }, []);

  useEffect(() => {
    readerRef.current = new BrowserMultiFormatReader(hints, 250);
    return () => {
      try {
        readerRef.current?.reset();
      } catch { /* scanner already stopped — nothing to recover */ }
      readerRef.current = null;
    };
  }, [hints]);

  async function startCamera() {
    setErr(null);
    setLast("");
    if (!videoRef.current || !readerRef.current) return;

    try {
      setRunning(true);

      // Start decoding from video device
      await readerRef.current.decodeFromVideoDevice(
        null,
        videoRef.current,
        (result, error) => {
          if (result?.getText()) {
            const text = result.getText();
            // stop scanning once we have a result
            stopCamera();
            setLast(text);
            if (onDetected) onDetected(text);
            if (onScan) onScan(text);
          }
          // ignore decode errors; they happen while scanning
          void error;
        }
      );
    } catch (e) {
      setRunning(false);
      setErr(e?.message || "Camera scanner failed.");
    }
  }

  function stopCamera() {
    try {
      readerRef.current?.reset();
    } catch { /* scanner already stopped — nothing to recover */ }
    setRunning(false);
  }

  async function scanImage(file: File | null) {
    setErr(null);
    setLast("");
    if (!file || !readerRef.current) return;

    try {
      const url = URL.createObjectURL(file);
      const result = await readerRef.current.decodeFromImageUrl(url);
      URL.revokeObjectURL(url);

      const text = result?.getText?.() || "";
      if (!text) throw new Error("No barcode/QR detected in image.");

      setLast(text);
      if (onDetected) onDetected(text);
      if (onScan) onScan(text);
    } catch (e) {
      setErr(e?.message || "Image scan failed.");
    }
  }

  return (
    <div className={className || ""}>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Barcode / QR Scanner (FREE)</div>
        <div className="mt-1 text-xs text-slate-500">
          Best results: CODE128 or QR on the waybill. This extracts the waybill number instantly.
        </div>

        {err ? (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {err}
          </div>
        ) : null}

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-600">Scan with camera</div>
            <video
              ref={videoRef}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-black"
              style={{ aspectRatio: "16 / 10" }}
              muted
              playsInline
            />
            <div className="mt-2 flex gap-2">
              {!running ? (
                <button
                  onClick={startCamera}
                  className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Start Camera
                </button>
              ) : (
                <button
                  onClick={stopCamera}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Stop
                </button>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-600">Or scan from an image</div>
            <input
              type="file"
              accept="image/*"
              className="mt-2 block w-full text-sm"
              onChange={(e) => scanImage(e.target.files?.[0] || null)}
            />

            <div className="mt-3 text-xs text-slate-500">
              If you already took a photo, upload it here and weâ€™ll extract the code.
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-slate-600">Last detected</div>
              <input className={inputBase()} value={last} readOnly placeholder="â€”" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
