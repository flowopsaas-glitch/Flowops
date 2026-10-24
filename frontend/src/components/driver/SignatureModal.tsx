import React, { useRef, useState, useEffect } from "react";
import { X, Eraser, CheckCircle2 } from "lucide-react";

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  waybillNumber: string;
  onSave: (signatureBlob: Blob) => void;
}

export default function SignatureModal({
  isOpen,
  onClose,
  waybillNumber,
  onSave,
}: SignatureModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const penRef = useRef<{ x: number; y: number; down: boolean } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Resize canvas to look sharp on high-DPI mobile screens
  useEffect(() => {
    if (isOpen && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Set actual size in memory (scaled for retina displays)
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
      ctx.scale(2, 2);

      // Setup pen style
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#000000"; // Black ink on white glass
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // ✍️ Drawing Logic
  const startDrawing = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    e.preventDefault();
    setIsDrawing(true);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  // Keyboard signing: focus the pad, move the pen with arrow keys,
  // Space drops/lifts the pen. Same canvas, same ink as pointer input.
  const keyDraw = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (!penRef.current) {
      penRef.current = { x: canvas.offsetWidth / 2, y: canvas.offsetHeight / 2, down: false };
    }
    const pen = penRef.current;
    const step = e.shiftKey ? 12 : 4;
    let { x, y } = pen;
    if (e.key === " ") {
      e.preventDefault();
      pen.down = !pen.down;
      if (pen.down) { ctx.beginPath(); ctx.moveTo(x, y); }
      return;
    }
    if (e.key === "ArrowLeft") x -= step;
    else if (e.key === "ArrowRight") x += step;
    else if (e.key === "ArrowUp") y -= step;
    else if (e.key === "ArrowDown") y += step;
    else return;
    e.preventDefault();
    x = Math.max(0, Math.min(canvas.offsetWidth, x));
    y = Math.max(0, Math.min(canvas.offsetHeight, y));
    if (pen.down) { ctx.lineTo(x, y); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(x, y); }
    pen.x = x; pen.y = y;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    penRef.current = null;
    }
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Convert canvas drawing to a PNG Blob to send to the backend
    canvas.toBlob((blob) => {
      if (blob) onSave(blob);
    }, "image/png");
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/90 backdrop-blur-md font-sans">
      {/* HEADER */}
      <div className="px-6 py-6 flex justify-between items-center bg-slate-900 border-b border-white/10">
        <div>
          <h2 className="text-xl font-black text-white">Sign on Glass</h2>
          <p className="text-[10px] text-blue-400 uppercase tracking-widest font-bold">
            POD: {waybillNumber}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-3 bg-white/5 rounded-full text-white/50 hover:text-white"
        >
          <X size={24} />
        </button>
      </div>

      {/* CANVAS AREA (The "Glass") */}
      <div className="flex-1 p-6 flex flex-col justify-center">
        <div className="bg-white rounded-3xl overflow-hidden shadow-2xl shadow-blue-900/20 relative aspect-square max-h-[400px]">
          <canvas
            ref={canvasRef}
            tabIndex={0}
            role="img"
            aria-label="Signature pad. Draw with mouse, touch, or keyboard: arrow keys move the pen, Space drops or lifts it."
            onKeyDown={keyDraw}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseOut={stopDrawing}
            onBlur={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className="w-full h-full touch-none cursor-crosshair"
          />
          <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
            <p className="text-slate-300 font-bold uppercase tracking-widest text-[10px]">
              Receiver Signature
            </p>
          </div>
        </div>
      </div>

      {/* CONTROLS */}
      <div className="p-6 bg-slate-900 border-t border-white/10 flex gap-4 pb-12">
        <button
          onClick={clearCanvas}
          className="flex-1 bg-white/5 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 active:bg-white/10"
        >
          <Eraser size={18} /> Clear
        </button>
        <button
          onClick={handleSave}
          className="flex-[2] bg-blue-600 active:bg-blue-500 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-500/20 flex items-center justify-center gap-2"
        >
          <CheckCircle2 size={18} /> Confirm POD
        </button>
      </div>
    </div>
  );
}
