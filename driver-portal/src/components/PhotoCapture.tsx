import { useRef, useState } from 'react';
import { Camera, X, RefreshCw } from 'lucide-react';

/**
 * PhotoCapture — proof photo for the driver (delivered parcel / damage / safe
 * place). Uses the device camera via a file input with `capture` (works on iOS
 * + Android PWAs, no native plugin needed) and compresses the image on-device
 * to a lightweight JPEG so it's cheap to store offline and cheap to upload on
 * mobile data. Returns a data URL via onCapture.
 */
export default function PhotoCapture({
  label = 'Add photo',
  onCapture,
}: {
  label?: string;
  onCapture: (dataUrl: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const dataUrl = await compressImage(file, 1024, 0.7);
      setPreview(dataUrl);
      onCapture(dataUrl);
    } catch {
      // If compression fails for any reason, fall back to the raw file so we
      // never block the driver from attaching evidence.
      const raw = await readAsDataUrl(file);
      setPreview(raw);
      onCapture(raw);
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setPreview(null);
    onCapture(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
      />

      {preview ? (
        <div className="relative rounded-xl overflow-hidden border border-white/10">
          <img src={preview} alt="Proof" className="w-full max-h-56 object-cover" />
          <div className="absolute top-2 right-2 flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="p-2 rounded-lg bg-black/60 text-white backdrop-blur hover:bg-black/80"
              title="Retake"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={clear}
              className="p-2 rounded-lg bg-black/60 text-white backdrop-blur hover:bg-black/80"
              title="Remove"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/5 py-4 text-sm font-semibold text-gray-300 hover:bg-white/10 transition disabled:opacity-50"
        >
          <Camera className="w-5 h-5 text-emerald-300" />
          {busy ? 'Processing…' : label}
        </button>
      )}
    </div>
  );
}

/** Read a File as a base64 data URL. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/**
 * Compress an image to a max dimension + JPEG quality using a canvas. A 12MP
 * phone photo becomes a sharp ~100-200KB JPEG — small enough to hold in the
 * offline outbox and upload on 3G without draining data.
 */
async function compressImage(file: File, maxDim: number, quality: number): Promise<string> {
  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);

  let { width, height } = img;
  if (width > height && width > maxDim) {
    height = Math.round((height * maxDim) / width);
    width = maxDim;
  } else if (height > maxDim) {
    width = Math.round((width * maxDim) / height);
    height = maxDim;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas context');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
