import { useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Scan } from 'lucide-react';

interface QRScannerProps {
  onScan: (waybillNumber: string) => void;
  onClose: () => void;
  darkMode: boolean;
}

export default function QRScanner({ onScan, onClose, darkMode }: QRScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const startScanning = async () => {
    try {
      setError('');
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          const waybillMatch = decodedText.match(/WB[-\s]?[A-Z0-9]+/i);
          if (waybillMatch) {
            onScan(waybillMatch[0].toUpperCase());
            scanner.stop().catch(console.error);
            setScanning(false);
          } else {
            setError('Invalid waybill format. Expected: WB-XXX-XXX');
          }
        },
        () => {}
      );
      setScanning(true);
    } catch (err: any) {
      setError('Failed to start camera. Please allow camera access.');
      console.error(err);
    }
  };

  const stopScanning = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(console.error);
    }
    setScanning(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className={`${darkMode ? 'bg-slate-900' : 'bg-white'} rounded-3xl w-full max-w-md overflow-hidden border ${darkMode ? 'border-white/10' : 'border-gray-200'}`}>
        <div className={`p-4 border-b ${darkMode ? 'border-white/10' : 'border-gray-200'} flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <Scan className={`w-6 h-6 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
            <h3 className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>Scan Waybill QR</h3>
          </div>
          <button onClick={stopScanning} className={`p-2 rounded-xl ${darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
            <X className={`w-5 h-5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
          </button>
        </div>
        <div className="p-4">
          {!scanning ? (
            <button onClick={startScanning} className="w-full py-12 border-2 border-dashed border-blue-500 rounded-2xl flex flex-col items-center justify-center hover:bg-blue-500/10 transition-all">
              <Scan className={`w-16 h-16 ${darkMode ? 'text-blue-400' : 'text-blue-600'} mb-4`} />
              <p className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Tap to Start Scanning</p>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-1`}>Point camera at waybill QR code</p>
            </button>
          ) : (
            <div className="space-y-4">
              <div id="qr-reader" className="rounded-2xl overflow-hidden"></div>
              <div className={`text-center ${darkMode ? 'text-gray-400' : 'text-gray-600'} text-sm`}>
                Position the QR code within the frame
              </div>
            </div>
          )}
          {error && (
            <div className="mt-4 bg-red-500/20 border border-red-500/30 text-red-200 p-4 rounded-xl text-sm">{error}</div>
          )}
          <div className={`mt-4 p-4 rounded-xl ${darkMode ? 'bg-white/5' : 'bg-gray-100'}`}>
            <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              <strong>Tip:</strong> Waybill QR codes contain the waybill number (e.g., WB-TEST-001)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
