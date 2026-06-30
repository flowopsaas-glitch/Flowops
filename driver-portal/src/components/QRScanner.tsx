import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { X, ScanLine } from 'lucide-react';

/**
 * Scans a parcel label's QR (a /track/<tn> URL) or its Code128 barcode (the
 * raw tracking number) and returns the extracted tracking number.
 */
export default function QRScanner({
  onScan,
  onClose,
}: {
  onScan: (trackingNumber: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let controls: IScannerControls | undefined;
    let done = false;

    reader
      .decodeFromConstraints({ video: { facingMode: 'environment' } }, videoRef.current!, (result) => {
        if (result && !done) {
          done = true;
          const raw = result.getText().trim();
          const tn = raw.includes('/track/') ? decodeURIComponent(raw.split('/track/').pop() || raw) : raw;
          try { controls?.stop(); } catch { /* ignore */ }
          onScan(tn);
        }
      })
      .then((c) => { controls = c; })
      .catch((e) => setError(e?.message || 'Camera unavailable — grant permission and retry.'));

    return () => { try { controls?.stop(); } catch { /* ignore */ } };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col safe-area-top safe-area-bottom">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2 text-white font-semibold"><ScanLine className="w-5 h-5 text-blue-400" /> Scan waybill</div>
        <button onClick={onClose} className="p-2 rounded-xl border border-white/15 text-white hover:bg-white/10"><X className="w-5 h-5" /></button>
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="relative w-full max-w-sm aspect-square rounded-3xl overflow-hidden border border-white/15">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          <div className="absolute inset-8 border-2 border-blue-400/70 rounded-2xl pointer-events-none" />
        </div>
      </div>
      <p className="text-center text-sm text-gray-300 pb-6 px-6">
        {error || 'Point the camera at the QR code or barcode on the parcel label.'}
      </p>
    </div>
  );
}
