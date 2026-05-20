import React, { useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Camera, X, RefreshCw, CheckCircle2, Zap } from 'lucide-react';

interface CameraScannerProps {
  onCapture: (base64Image: string) => void;
  onClose: () => void;
  title?: string;
}

export default function CameraScanner({ onCapture, onClose, title = "Scan Waybill" }: CameraScannerProps) {
  const webcamRef = useRef<Webcam>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [isFlashOn, setIsFlashOn] = useState(false);

  const capture = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) setImgSrc(imageSrc);
  }, [webcamRef]);

  const videoConstraints = {
    facingMode: "environment", // 🚀 Forces back camera on mobile
    aspectRatio: 1,
  };

  return (
    <div className="fixed inset-0 bg-slate-950 z-[100] flex flex-col font-sans">
      {/* 🟦 Header */}
      <div className="p-6 flex justify-between items-center bg-slate-900/50 backdrop-blur-xl border-b border-white/5">
        <div>
          <p className="text-[10px] font-black text-sky-500 uppercase tracking-[0.3em]">Compliance Scan</p>
          <h2 className="text-white font-black italic uppercase text-lg">{title}</h2>
        </div>
        <button onClick={onClose} className="p-3 bg-white/5 rounded-2xl text-slate-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* 📸 Viewport */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {!imgSrc ? (
          <>
            <Webcam
              audio={false}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              videoConstraints={videoConstraints}
              className="w-full h-full object-cover"
            />
            {/* 🎯 Alignment Overlay */}
            <div className="absolute inset-10 border-2 border-dashed border-white/20 rounded-[40px] pointer-events-none flex items-center justify-center">
               <div className="w-12 h-1 text-white/10 bg-white/10 rounded-full" />
            </div>
          </>
        ) : (
          <img src={imgSrc} className="w-full h-full object-cover" alt="Captured" />
        )}
      </div>

      {/* 🔘 Controls */}
      <div className="p-10 bg-slate-950 flex justify-center items-center gap-8">
        {!imgSrc ? (
          <>
            <button 
               onClick={() => setIsFlashOn(!isFlashOn)}
               className={`p-5 rounded-full border transition-all ${isFlashOn ? 'bg-amber-500 border-amber-400 text-slate-950' : 'bg-white/5 border-white/10 text-slate-400'}`}
            >
              <Zap size={24} fill={isFlashOn ? "currentColor" : "none"} />
            </button>

            <button 
              onClick={capture}
              className="h-24 w-24 rounded-full border-8 border-white/10 bg-sky-500 flex items-center justify-center text-white shadow-2xl shadow-sky-500/20 active:scale-90 transition-all"
            >
              <Camera size={32} />
            </button>

            <div className="w-[64px]" /> {/* Spacer for balance */}
          </>
        ) : (
          <div className="flex gap-4 w-full max-w-sm">
            <button 
              onClick={() => setImgSrc(null)}
              className="flex-1 bg-white/5 py-5 rounded-3xl font-black text-[10px] uppercase tracking-widest text-slate-400 border border-white/5 flex items-center justify-center gap-2"
            >
              <RefreshCw size={16} /> Retake
            </button>
            <button 
              onClick={() => onCapture(imgSrc)}
              className="flex-1 bg-emerald-500 py-5 rounded-3xl font-black text-[10px] uppercase tracking-widest text-white shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2"
            >
              <CheckCircle2 size={16} /> Use Photo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
