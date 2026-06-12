import React, { useState, useEffect, useRef } from 'react';
import { Send, Terminal, X, ChevronRight, Cpu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FLOWOPS_API_URL } from '../lib/env';

interface Message {
  role: 'user' | 'claw' | 'system' | 'system_thought';
  text: string;
}

interface ClawProps {
  onClose: () => void;
  liveMetrics?: { risks?: number; activeDrivers?: number };
}

export default function AiClawChat({ onClose, liveMetrics }: ClawProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<Message[]>([
    { role: 'claw', text: "SYSTEM READY. Neural logic initialized. Awaiting tactical input..." }
  ]);
  const [isThinking, setIsThinking] = useState(false);
  
  // Self-awareness metrics state for superintelligence telemetry
  const [telemetry, setTelemetry] = useState({
    latencyMs: 0,
    contextTokens: 0,
    activeSubroutines: ['Core Logic Layer', 'Risk Analytics Engine']
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [history, isThinking]);

  const handleSend = async () => {
    const trimmedInput = query.trim();
    if (!trimmedInput || isThinking) return;

    // 1. Log the user message & inject a local introspective thought step immediately
    const userMessage: Message = { role: 'user', text: trimmedInput };
    const introspectiveThought: Message = { 
      role: 'system_thought', 
      text: `[INTROSPECTION] Evaluating risks (${liveMetrics?.risks ?? 0}) and active drivers (${liveMetrics?.activeDrivers ?? 0}). Formatting vector parameters...` 
    };

    setHistory(prev => [...prev, userMessage, introspectiveThought]);
    setQuery("");
    setIsThinking(true);

    const startTime = Date.now();

    try {
      // 2. Map the chat log into a structured format your backend LLM can read
      const cleanHistory = history
        .filter(msg => msg.role !== 'system_thought')
        .map(msg => ({
          role: msg.role === 'claw' ? 'assistant' : msg.role,
          content: msg.text
        }));

      // 3. Expanded payload for NestJS to make the LLM aware of its ecosystem
      const requestBody = {
        command: trimmedInput,
        companyId: 1, 
        context: {
          liveMetrics: liveMetrics || { risks: 0, activeDrivers: 0 },
          history: cleanHistory,
          telemetry: telemetry
        }
      };

      const response = await fetch(`${FLOWOPS_API_URL}/ai/claw-chat/query`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("BACKEND_VALIDATION_ERROR:", data);
        throw new Error(data.message || "Protocol handshake failed");
      }

      // Update self-awareness metrics based on actual server output data
      setTelemetry({
        latencyMs: Date.now() - startTime,
        contextTokens: data.telemetry?.tokensUsed || telemetry.contextTokens + 120,
        activeSubroutines: data.telemetry?.subroutines || ['Context Mapping', 'Routing Subsystem']
      });

      if (data.redirect) {
        setHistory(prev => [...prev, { role: 'system', text: `AUTONOMOUS REROUTING: Navigating to ${data.redirect}...` }]);
        setTimeout(() => navigate(data.redirect), 1200);
      }

      setHistory(prev => [...prev, { role: 'claw', text: data.reply || "COMMAND_EXECUTED_SUCCESSFULLY" }]);
      
    } catch (err: any) {
      console.error("CLAW_BRIDGE_ERROR:", err);
      setHistory(prev => [...prev, { 
        role: 'system', 
        text: `SIGNAL_LOST: ${err.message}` 
      }]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className="flex flex-col h-[650px] w-full bg-[#040d21] border border-sky-500/30 rounded-2xl overflow-hidden font-mono shadow-[0_0_80px_rgba(0,0,0,0.8)] backdrop-blur-xl">
      
      {/* HEADER / STATUS BAR */}
      <div className="bg-sky-950/40 p-4 border-b border-white/10 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-sky-500/10 rounded-lg">
            <Terminal size={18} className="text-sky-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-400">OPERATIONAL_CLAW_V2.0_HYPERINTEL</span>
            <div className="flex items-center gap-1.5">
               <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
               <span className="text-[8px] text-emerald-500/80 uppercase font-bold tracking-widest">Cognitive State: Online</span>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-2 text-white/20 hover:text-white hover:bg-white/5 rounded-full transition-all">
          <X size={20}/>
        </button>
      </div>

      {/* METRICS TELEMETRY BAR */}
      <div className="px-5 py-2 bg-black/60 border-b border-white/5 flex gap-5 text-[9px] text-slate-400 tracking-wider uppercase border-t border-sky-950/20">
        <div>Latency: <span className="text-sky-400 font-bold">{telemetry.latencyMs}ms</span></div>
        <div>Memory Allocated: <span className="text-indigo-400 font-bold">{telemetry.contextTokens} tokens</span></div>
        <div className="truncate max-w-[250px]">Engaged Nodes: <span className="text-emerald-400 font-bold">{telemetry.activeSubroutines.join(' | ')}</span></div>
      </div>

      {/* CHAT TERMINAL FEED */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin scrollbar-thumb-sky-900 scrollbar-track-transparent">
        <div className="flex items-center gap-2 text-sky-400/40 italic text-[10px] mb-6">
          <ChevronRight size={12} />
          <span>Supervising {liveMetrics?.risks ?? 0} risks in current sector.</span>
        </div>

        {history.map((msg, i) => (
          <div key={i} className="flex flex-col gap-1">
            {msg.role === 'system_thought' ? (
              <div className="bg-amber-500/5 border border-amber-500/10 text-amber-400/60 font-mono text-[9px] p-2.5 rounded-lg flex items-center gap-2 my-1 animate-pulse">
                <Cpu size={11} />
                {msg.text}
              </div>
            ) : (
              <>
                <div className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest ${
                  msg.role === 'user' ? 'text-white/40' : 
                  msg.role === 'system' ? 'text-rose-500/60' : 'text-sky-400/60'
                }`}>
                  {msg.role === 'user' ? 'USER_AUTH_SESSION' : msg.role === 'system' ? 'KERNEL_CRITICAL' : 'AI_CLAW_LOGIC'}
                </div>
                
                <div className={`text-[12px] leading-relaxed ${
                  msg.role === 'user' ? 'text-white' : 
                  msg.role === 'system' ? 'text-rose-400 font-bold' : 'text-sky-300'
                }`}>
                  <span className="text-sky-500/30 mr-2">»</span>
                  {msg.text}
                </div>
              </>
            )}
          </div>
        ))}

        {isThinking && (
          <div className="flex items-center gap-2 text-sky-500 animate-pulse text-[11px] font-bold">
            <div className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-bounce" />
            [CLAW] DEPLOYING SUPERINTEL MULTI-THREAD ANALYSIS...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* COMMAND INPUT */}
      <div className="p-4 bg-black/40 border-t border-white/10 backdrop-blur-md">
        <div className="relative group">
          <input 
            autoFocus
            value={query} 
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Execute system commands..."
            className="w-full bg-black/60 border border-white/5 rounded-xl py-4 pl-5 pr-14 text-white text-[12px] placeholder:text-white/20 outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 transition-all shadow-inner"
          />
          <button disabled={isThinking || !query.trim()} onClick={handleSend} className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 text-sky-500 hover:text-sky-300 disabled:text-white/10 disabled:cursor-not-allowed transition-colors">
            <Send size={18} />
          </button>
        </div>
        <div className="mt-2 text-[8px] text-white/20 text-center uppercase tracking-[0.3em] font-black">
          FlowOps Tactical Interface // Hyperintelligence Upgrade
        </div>
      </div>
    </div>
  );
}

