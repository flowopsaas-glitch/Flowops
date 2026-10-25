import React, { useMemo, useState, useRef, useEffect } from "react";
import { useDismissOnEscape } from "./patterns/useDismissOnEscape";
import { X, Send, Bot, Sparkles } from "lucide-react";
import type { ShipmentLike, AiInsight } from "../utils/aiHeuristics";
import { insightsFromShipments } from "../utils/aiHeuristics";
import { FLOWOPS_OLLAMA_URL } from "../lib/env";

type Props = {
  open: boolean;
  onClose: () => void;
  shipmentsForSignals?: ShipmentLike[];
};

type ChatMsg = { role: "user" | "assistant"; text: string };

async function tryOllama(prompt: string): Promise<string | null> {
  // Feature is opt-in via VITE_OLLAMA_URL. When unset, the panel falls back
  // to deterministic heuristics rather than calling localhost from a
  // production bundle.
  if (!FLOWOPS_OLLAMA_URL) return null;
  try {
    const res = await fetch(`${FLOWOPS_OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        prompt,
        stream: false,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: string };
    return data?.response?.trim() || null;
  } catch {
    return null;
  }
}

function severityPill(sev: "LOW" | "MEDIUM" | "HIGH") {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider";
  if (sev === "HIGH") return `${base} bg-red-500/10 text-red-500 border border-red-500/20`;
  if (sev === "MEDIUM") return `${base} bg-amber-500/10 text-amber-500 border border-amber-500/20`;
  return `${base} bg-emerald-500/10 text-emerald-500 border border-emerald-500/20`;
}

export default function AiCopilotPanel({ open, onClose, shipmentsForSignals = [] }: Props) {
  useDismissOnEscape(open, onClose);
  const [mode, setMode] = useState<"FREE" | "LOCAL_LLM">("FREE");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [chat, setChat] = useState<ChatMsg[]>([
    {
      role: "assistant",
      text: "I’m your Ops Copilot. I analyze your live shipments to find risks before they become problems.",
    },
  ]);

  const insights: AiInsight[] = useMemo(
    () => insightsFromShipments(shipmentsForSignals),
    [shipmentsForSignals]
  );

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat]);

  if (!open) return null;

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setChat((c) => [...c, { role: "user", text }]);
    setBusy(true);

    try {
      const context =
        `Operational signals:\n` +
        insights.map((i) => `- [${i.severity}] ${i.title}: ${i.explanation}`).join("\n") +
        `\n\nUser question: ${text}\n\nRespond with: (1) short answer, (2) 3 concrete actions.`;

      if (mode === "LOCAL_LLM") {
        const out = await tryOllama(context);
        if (out) {
          setChat((c) => [...c, { role: "assistant", text: out }]);
          return;
        }
        setChat((c) => [...c, { role: "assistant", text: "LOCAL LLM (Ollama) not detected. Ensure Ollama is running llama3 locally. Falling back to FREE mode." }]);
      }

      // FREE mode: Intelligent local fallback
      const top = insights[0];
      const answer =
        `Analysis based on live signals: ${top ? `We are currently monitoring ${top.title.toLowerCase()}.` : "Everything looks stable."}\n\n` +
        `Recommended Actions:\n` +
        (top?.actions?.length
          ? top.actions.slice(0, 3).map((a, idx) => `${idx + 1}. ${a}`).join("\n")
          : `1. Review active shipment logs\n2. Check driver ETAs\n3. Refresh dashboard for latest signals`);

      setChat((c) => [...c, { role: "assistant", text: answer }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" ><button type="button" aria-label="Close dialog" className="absolute inset-0 h-full w-full cursor-default" onClick={onClose} /></div>

      {/* Panel */}
      <div className="relative h-full w-full sm:w-[500px] bg-white shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300" role="dialog" aria-modal="true" aria-label="AI copilot">

        {/* Header */}
        <div className="h-16 border-b border-slate-100 px-6 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center">
              <Bot size={18} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">Ops Intelligence</div>
              <div className="text-[10px] text-slate-500 font-medium uppercase tracking-tighter">Copilot v1.0 (Beta)</div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
            <X size={20} />
          </button>
        </div>

        {/* Mode & Signals */}
        <div className="p-4 bg-white border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Processing Mode</span>
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setMode("FREE")}
                className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${mode === "FREE" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
              >FREE</button>
              <button
                onClick={() => setMode("LOCAL_LLM")}
                className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${mode === "LOCAL_LLM" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
              >LOCAL LLM</button>
            </div>
          </div>

          <div className="space-y-2">
            {insights.slice(0, 2).map((i) => (
              <div key={i.title} className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-900">{i.title}</span>
                  <span className={severityPill(i.severity)}>{i.severity}</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">{i.explanation}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 scroll-smooth">
          {chat.map((m, idx) => (
            <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === "user" ? "bg-slate-900 text-white shadow-lg" : "bg-slate-100 text-slate-800"
              }`}>
                {m.text}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="bg-slate-100 rounded-2xl px-4 py-3 flex gap-1">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-slate-100">
          <div className="relative">
            <input
              id="copilot-chat-input"
              name="copilot-chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="How do I clear the backlog?"
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-4 pr-12 text-sm outline-none focus:ring-2 ring-slate-900/5 transition-all"
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              className="absolute right-2 top-2 h-8 w-8 bg-slate-900 text-white rounded-xl flex items-center justify-center hover:bg-slate-800 disabled:bg-slate-200 transition-colors"
            >
              <Send size={14} />
            </button>
          </div>
          <div className="mt-2 text-center">
            <span className="text-[10px] text-slate-400 font-medium flex items-center justify-center gap-1">
              <Sparkles size={10} /> Powered by local operational logic
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
