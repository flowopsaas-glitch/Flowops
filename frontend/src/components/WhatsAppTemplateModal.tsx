import React, { useEffect, useMemo, useState } from "react";
import { X, Loader2, Send, FileText } from "lucide-react";
import { api } from "../api/client";
import { useToast } from "./ui/use-toast";

type Template = {
  name: string;
  language: string;
  status: string;
  category?: string;
  bodyText: string;
  variableCount: number;
};

/**
 * Send an approved WhatsApp template — the only way to message a customer
 * outside the 24-hour window (e.g. "your parcel is out for delivery").
 * Falls back to a manual name/variables form when the template list isn't
 * available (no WHATSAPP_BUSINESS_ACCOUNT_ID configured).
 */
export default function WhatsAppTemplateModal({
  to,
  onClose,
  onSent,
}: {
  to: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [manualName, setManualName] = useState("");
  const [manualLang, setManualLang] = useState("en_US");
  const [manualCount, setManualCount] = useState(0);
  const [vars, setVars] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res: any = await api.get("/whatsapp/templates");
        const data = res?.data ?? res;
        const approved: Template[] = (data?.templates ?? []).filter(
          (t: Template) => String(t.status).toUpperCase() === "APPROVED",
        );
        setConfigured(Boolean(data?.configured) && approved.length > 0);
        setTemplates(approved);
        if (approved.length) setSelected(approved[0].name);
      } catch {
        setConfigured(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const active = useMemo(
    () => templates.find((t) => t.name === selected) ?? null,
    [templates, selected],
  );

  const varCount = configured ? active?.variableCount ?? 0 : manualCount;

  // keep the vars array sized to the template's variable count
  useEffect(() => {
    setVars((prev) => {
      const next = [...prev];
      next.length = varCount;
      for (let i = 0; i < varCount; i++) if (next[i] == null) next[i] = "";
      return next;
    });
  }, [varCount]);

  function preview(): string {
    const body = configured ? active?.bodyText ?? "" : "";
    return body.replace(/\{\{(\d+)\}\}/g, (_m, n) => vars[Number(n) - 1] || `{{${n}}}`);
  }

  async function send() {
    const name = configured ? active?.name : manualName.trim();
    const language = configured ? active?.language ?? "en_US" : manualLang.trim() || "en_US";
    if (!name) {
      toast({ title: "Pick or enter a template name.", variant: "destructive" });
      return;
    }
    if (vars.some((v) => !String(v ?? "").trim())) {
      toast({ title: "Fill in all template variables.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const res: any = await api.post("/whatsapp/send-template", {
        to,
        name,
        language,
        variables: vars,
      });
      const data = res?.data ?? res;
      if (data?.configured === false) {
        toast({ title: data?.message ?? "WhatsApp not configured.", variant: "destructive" });
        return;
      }
      toast({ title: "Template sent." });
      onSent();
    } catch (e: any) {
      const detail = e?.response?.data?.message || e?.message || "Send failed";
      toast({ title: "Template send failed", description: detail, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b1220] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-black text-white">
            <FileText size={18} className="text-emerald-400" /> Send Template
          </h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={20} /></button>
        </div>

        <p className="mb-4 text-xs text-white/40">
          To: <span className="font-mono text-white/70">{to}</span> — templates are required to start a
          conversation or message outside the 24-hour window.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-white/50"><Loader2 className="animate-spin" size={18} /> Loading templates…</div>
        ) : (
          <div className="space-y-3">
            {configured ? (
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-white/50">Template</span>
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50"
                >
                  {templates.map((t) => (
                    <option key={`${t.name}/${t.language}`} value={t.name}>
                      {t.name} ({t.language}){t.category ? ` · ${t.category}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-2.5 text-[11px] text-amber-200/80">
                  Template list unavailable (set <code>WHATSAPP_BUSINESS_ACCOUNT_ID</code> to enable the picker).
                  You can still send by entering an approved template's exact name.
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-[11px] uppercase tracking-wide text-white/50">Template name</span>
                    <input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="e.g. delivery_update"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] uppercase tracking-wide text-white/50">Language</span>
                    <input value={manualLang} onChange={(e) => setManualLang(e.target.value)} placeholder="en_US"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50" />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-[11px] uppercase tracking-wide text-white/50">Number of variables</span>
                  <input type="number" min={0} max={10} value={manualCount}
                    onChange={(e) => setManualCount(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50" />
                </label>
              </>
            )}

            {varCount > 0 && (
              <div className="space-y-2">
                <span className="block text-[11px] uppercase tracking-wide text-white/50">Variables</span>
                {Array.from({ length: varCount }).map((_, i) => (
                  <input
                    key={i}
                    value={vars[i] ?? ""}
                    onChange={(e) => setVars((p) => { const n = [...p]; n[i] = e.target.value; return n; })}
                    placeholder={`{{${i + 1}}}`}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50"
                  />
                ))}
              </div>
            )}

            {configured && active?.bodyText && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/70">
                <span className="mb-1 block text-[10px] uppercase tracking-wide text-white/40">Preview</span>
                {preview()}
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10">Cancel</button>
          <button
            onClick={() => void send()}
            disabled={sending || loading}
            className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send Template
          </button>
        </div>
      </div>
    </div>
  );
}
