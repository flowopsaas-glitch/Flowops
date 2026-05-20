import React, { useState, useRef, useEffect } from 'react';
import { Camera, Package, MapPin, User, CheckCircle2, RefreshCw, AlertCircle, CloudUpload } from 'lucide-react';
import SignaturePad from '../components/SignaturePad';
import { collectionApi } from '../api/collectionApi';

export default function CollectionScreen() {
  const [step, setStep] = useState<'camera' | 'signature' | 'syncing' | 'success'>('camera');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (step === 'camera') startCamera();
    else stopCamera();
    return () => stopCamera();
  }, [step]);

  const startCamera = async () => {
    setIsCameraReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' }, 
        audio: false 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraReady(true);
      }
    } catch (err) {
      console.warn("Camera fallback...");
      const stream = await navigator.mediaDevices.getUserMedia({ video: true }).catch(() => null);
      if (stream && videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraReady(true);
      }
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach(track => track.stop());
  };

  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas) {
      const context = canvas.getContext('2d');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context?.drawImage(video, 0, 0);
      setCapturedImage(canvas.toDataURL('image/jpeg', 0.8));
      setStep('signature');
    }
  };

  const handleFinalSync = async (signatureDataUrl: string) => {
    setStep('syncing');
    setSyncError(null);

    try {
      // 🛰️ Execute Tactical Uplink
      await collectionApi.uploadPOC({
        orderId: 'ORD-99284', // This would be dynamic in production
        waybillImage: capturedImage!,
        signature: signatureDataUrl,
      });
      
      setStep('success');
    } catch (err) {
      console.error("Sync Failed:", err);
      setSyncError("Uplink Failed. Check connection and retry.");
      setStep('signature');
    }
  };

  return (
    <div className="min-h-screen bg-[#020817] p-6 text-white font-sans">
      <header className="mb-8">
        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500 mb-1 italic">
          {step === 'camera' ? 'Step 1: Capture' : step === 'signature' ? 'Step 2: Sign' : 'Syncing'}
        </div>
        <h1 className="text-3xl font-black italic tracking-tighter uppercase">Proof of Collection</h1>
      </header>

      {/* JOB CONTEXT */}
      <div className="bg-white/5 border border-white/10 rounded-[32px] p-6 mb-8 backdrop-blur-xl">
        <div className="flex items-center gap-4 mb-4">
          <div className="bg-emerald-500/20 p-3 rounded-2xl text-emerald-500"><Package size={24} /></div>
          <div><div className="text-[10px] font-black uppercase opacity-40 tracking-widest">Client Order</div><div className="text-lg font-black tracking-tight italic">ORD-99284 / Randburg</div></div>
        </div>
      </div>

      <div className="space-y-6">
        {step === 'camera' && (
          <div className="space-y-6">
            <div className="relative aspect-[4/3] w-full bg-black rounded-[32px] border-2 border-dashed border-white/20 overflow-hidden">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              {!isCameraReady && <div className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-4"><RefreshCw size={32} className="text-emerald-500 animate-spin" /><span className="text-[10px] font-black uppercase tracking-widest opacity-40">Uplinking Lens...</span></div>}
            </div>
            <button onClick={takePhoto} disabled={!isCameraReady} className="w-full py-6 bg-blue-600 rounded-[28px] text-sm font-black uppercase tracking-[0.2em] shadow-2xl flex items-center justify-center gap-3">
              <Camera size={20} /> Capture Waybill
            </button>
            <canvas ref={canvasRef} className="hidden" />
          </div>
        )}

        {step === 'signature' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
             {syncError && (
               <div className="mb-4 p-4 bg-rose-500/20 border border-rose-500/50 rounded-2xl flex items-center gap-3 text-rose-500 text-xs font-bold">
                 <AlertCircle size={16} /> {syncError}
               </div>
             )}
             <div className="mb-4 flex items-center gap-2 text-emerald-500 italic">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest">Awaiting Handshake</span>
             </div>
             <SignaturePad onSave={handleFinalSync} />
          </div>
        )}

        {step === 'syncing' && (
          <div className="text-center py-20 flex flex-col items-center justify-center">
             <div className="relative mb-8">
               <CloudUpload size={64} className="text-blue-500 animate-bounce" />
               <div className="absolute -inset-4 bg-blue-500/20 blur-3xl rounded-full animate-pulse" />
             </div>
             <h2 className="text-2xl font-black italic tracking-tighter uppercase mb-2">Syncing with Tower</h2>
             <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.3em] animate-pulse">Encoding Data Packets...</p>
          </div>
        )}

        {step === 'success' && (
          <div className="text-center py-20 animate-in zoom-in duration-500">
             <div className="inline-flex bg-emerald-500 text-black p-6 rounded-full mb-6 shadow-[0_0_60px_rgba(16,185,129,0.5)]"><CheckCircle2 size={48} /></div>
             <h2 className="text-4xl font-black italic tracking-tighter uppercase mb-2">Sync Successful</h2>
             <p className="text-sm font-bold text-white/40 mb-8 uppercase tracking-widest italic italic">Waybill routed to AI-Inbox</p>
             <button onClick={() => setStep('camera')} className="bg-white/5 border border-white/10 px-10 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white hover:text-black transition-all">Next Job</button>
          </div>
        )}
      </div>
    </div>
  );
}
