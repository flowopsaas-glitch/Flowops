import React, { useMemo, useState, useRef, useEffect } from "react";
import { X, Send, Bot, Sparkles, Shield, Lock, AlertCircle, DollarSign } from "lucide-react";
import type { ShipmentLike, AiInsight } from "../utils/aiHeuristics";
import { insightsFromShipments } from "../utils/aiHeuristics";

type Props = {
  open: boolean;
  onClose: () => void;
  shipmentsForSignals?: ShipmentLike[];
};

type ChatMsg = { role: "user" | "assistant"; text: string; cost?: number };

async function tryOllama(prompt: string): Promise<string | null> {
  try {
    const res = await fetch("http://localhost:11434/api/generate", {
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

async function tryGroq(prompt: string, token: string): Promise<string | null> {
  try {
    const API_BASE = import.meta.env.VITE_FLOWOPS_API_URL || 'http://localhost:3000/api/v1';
    const res = await fetch(`${API_BASE}/ai-ops/assist`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        domain: "general",
        message: prompt,
        context: {},
        provider: "groq",
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.response || data?.message || null;
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
  const [mode, setMode] = useState<"FREE" | "LOCAL_LLM" | "GROQ">("FREE");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Security gate state
  const [isVerified, setIsVerified] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [securityCode, setSecurityCode] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [verifying, setVerifying] = useState(false);
  
  // Billing stats
  const [messageCount, setMessageCount] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  
  const [chat, setChat] = useState<ChatMsg[]>([
    {
      role: "assistant",
      text: "I'm your Ops Copilot. I analyze your live shipments to find risks before they become problems.",
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

  // Security code verification
  async function verifySecurityCode() {
    if (!securityCode.trim() || !clientEmail.trim()) {
      setVerifyError("Please enter both security code and email");
      return;
    }

    setVerifying(true);
    setVerifyError("");

    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('accessToken');
      const API_BASE = import.meta.env.VITE_FLOWOPS_API_URL || 'http://localhost:3000/api/v1';

      const response = await fetch(`${API_BASE}/ai-security/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ code: securityCode, clientEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Invalid security code');
      }

      setSessionId(data.sessionId);
      setIsVerified(true);
    } catch (err: any) {
      setVerifyError(err.message || 'Failed to verify security code');
    } finally {
      setVerifying(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setChat((c) => [...c, { role: "user", text, cost: mode === "GROQ" ? 0.50 : 0 }]);
    setBusy(true);

    // Track message for billing
    if (mode === "GROQ") {
      setMessageCount(prev => prev + 1);
      setTotalCost(prev => prev + 0.50);
    }

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

      if (mode === "GROQ") {
        const token = localStorage.getItem('access_token') || localStorage.getItem('accessToken');
        const out = await tryGroq(context, token || '');
        if (out) {
          setChat((c) => [...c, { role: "assistant", text: out }]);
          return;
        }
        setChat((c) => [...c, { role: "assistant", text: "Groq AI temporarily unavailable. Please try again or switch to another mode." }]);
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

  // Security Gate Screen
  if (!isVerified) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
        
        <div className="relative max-w-md w-full mx-4 bg-white rounded-3xl shadow-2xl p-8">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
            <X size={20} />
          </button>

          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500/10 rounded-2xl mb-4">
              <Shield className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">Secure AI Access</h2>
            <p className="text-sm text-slate-600">
              Enter your security code to access the AI Copilot
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Client Email
              </label>
              <input
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 ring-blue-500/20 transition"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Security Code
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={securityCode}
                  onChange={(e) => setSecurityCode(e.target.value.toUpperCase())}
                  placeholder="ENTER-CODE-HERE"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 ring-blue-500/20 transition font-mono tracking-wider"
                  maxLength={20}
                />
              </div>
            </div>

            {verifyError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{verifyError}</span>
              </div>
            )}

            <button
              onClick={verifySecurityCode}
              disabled={verifying}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition shadow-lg"
            >
              {verifying ? 'Verifying...' : 'Verify & Continue'}
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-xs text-slate-500 text-center flex items-center justify-center gap-1">
              <DollarSign className="w-3 h-3" />
              Groq AI messages cost R0.50 each and are billed to your account
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Main Chat Interface
  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      
      {/* Panel */}
      <div className="relative h-full w-full sm:w-[500px] bg-white shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300">
        
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

        {/* Billing Stats (if using Groq) */}
        {mode === "GROQ" && (
          <div className="px-6 py-2 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-blue-700">
              <DollarSign size={12} />
              <span className="font-bold">{messageCount} messages</span>
              <span>•</span>
              <span className="font-bold">R{totalCost.toFixed(2)}</span>
            </div>
            <span className="text-[10px] text-blue-600 font-medium">Billed to: {clientEmail}</span>
          </div>
        )}

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
              <button 
                onClick={() => setMode("GROQ")}
                className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${mode === "GROQ" ? "bg-blue-600 text-white shadow-sm" : "text-slate-500"}`}
              >GROQ ⚡</button>
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
                {m.cost && m.cost > 0 && (
                  <div className="text-[10px] opacity-70 mt-1 flex items-center gap-1">
                    <DollarSign size={8} />
                    R{m.cost.toFixed(2)}
                  </div>
                )}
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
              placeholder={mode === "GROQ" ? "Ask Groq AI... (R0.50 per message)" : "How do I clear the backlog?"}
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
              <Sparkles size={10} /> 
              {mode === "GROQ" ? "Powered by Groq AI • R0.50 per message" : "Powered by local operational logic"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
