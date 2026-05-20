import React, { useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { RotateCcw, CheckCircle2 } from 'lucide-react';
import { useToast } from './ToastProvider';

interface Props {
  onSave: (signatureDataUrl: string) => void;
  onClear?: () => void;
}

export default function SignaturePad({ onSave, onClear }: Props) {
  const sigPad = useRef<any>(null);

  const clear = () => {
    sigPad.current?.clear();
    if (onClear) onClear();
  };

  const { showToast } = useToast();

  const save = () => {
    if (sigPad.current?.isEmpty()) {
      showToast("Please provide a signature first.", "error");
      return;
    }
    const dataUrl = sigPad.current?.getTrimmedCanvas().toDataURL('image/png');
    onSave(dataUrl);
  };

  return (
    <div className="w-full space-y-4">
      <div className="relative w-full h-64 bg-slate-900 rounded-[24px] border-2 border-dashed border-white/10 overflow-hidden shadow-inner">
        <SignatureCanvas
          ref={sigPad}
          // @ts-ignore - penColor works at runtime but type defs vary
          penColor="white"
          canvasProps={{
            className: 'w-full h-full signature-canvas',
          }}
        />
        <div className="absolute top-4 right-4 pointer-events-none opacity-20">
          <div className="text-[10px] font-black uppercase tracking-widest text-white">Sign Above</div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={clear}
          className="flex-1 py-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest hover:bg-rose-500/20 hover:text-rose-500 transition-all"
        >
          <RotateCcw size={14} /> Clear
        </button>
        <button
          type="button"
          onClick={save}
          className="flex-[2] py-4 bg-emerald-500 text-black rounded-2xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest hover:bg-white transition-all shadow-lg shadow-emerald-500/20"
        >
          <CheckCircle2 size={16} /> Confirm Signature
        </button>
      </div>
    </div>
  );
}
