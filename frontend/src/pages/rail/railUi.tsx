import type { ReactNode } from "react";
import { X } from "lucide-react";
import { TONE_CLASS, type Tone } from "../../lib/railSlot";

export const inputCls =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none";

export const btnCls =
  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50";
export const btnPrimary = `${btnCls} border-emerald-500/30 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25`;
export const btnNeutral = `${btnCls} border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.07]`;
export const btnWarn = `${btnCls} border-amber-500/30 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25`;
export const btnDanger = `${btnCls} border-rose-500/30 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25`;

export function Pill({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE_CLASS[tone]}`}>
      {children}
    </span>
  );
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

export function Banner({ tone, title, children }: { tone: Tone; title: string; children?: ReactNode }) {
  return (
    <div role="status" className={`mt-4 rounded-xl border px-4 py-3 ${TONE_CLASS[tone]}`}>
      <div className="text-sm font-bold">{title}</div>
      {children && <div className="mt-0.5 text-xs opacity-90">{children}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className={`max-h-[90vh] w-full ${wide ? "max-w-2xl" : "max-w-lg"} overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0f14] p-6`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-black text-white">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-400">{label}</span>
      {children}
    </label>
  );
}
