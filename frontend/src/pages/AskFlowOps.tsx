import React, { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Loader2, Bot } from "lucide-react";
import { useToast } from "../components/toast-context";
import { cn } from "../lib/utils";
import { askCopilot, getCopilotSuggestions, type CopilotAnswer, type CopilotChart } from "../api/copilotApi";

const glassCard = (c?: string) =>
  cn("rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-xl", c);

type Entry = { id: number; question: string; answer?: CopilotAnswer; pending?: boolean; error?: string };

export default function AskFlowOps() {
  const { showToast } = useToast();
  const [q, setQ] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  // Monotonic ids for chat entries — unique without an impure clock call.
  const entryIdRef = useRef(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { getCopilotSuggestions().then(setSuggestions).catch(() => setSuggestions([])); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [entries]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setQ("");
    const id = (entryIdRef.current += 1);
    setEntries((e) => [...e, { id, question: text, pending: true }]);
    setBusy(true);
    try {
      const answer = await askCopilot(text);
      setEntries((e) => e.map((x) => (x.id === id ? { ...x, answer, pending: false } : x)));
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Something went wrong";
      setEntries((e) => e.map((x) => (x.id === id ? { ...x, error: msg, pending: false } : x)));
      showToast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col p-4 md:p-8 text-white">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-violet-500/30 to-sky-500/20 text-violet-200">
          <Sparkles className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight">Ask FlowOps</h1>
          <p className="text-sm text-white/50">Ask anything about your operation in plain English — answered live from your data.</p>
        </div>
      </div>

      {/* Transcript */}
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {entries.length === 0 && (
          <div className={glassCard("p-8 text-center")}>
            <Bot className="mx-auto h-10 w-10 text-violet-300/70" />
            <p className="mt-3 text-lg font-bold">What would you like to know?</p>
            <p className="mt-1 text-sm text-white/40">Try one of these to get started:</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button key={s} onClick={() => void ask(s)}
                  className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-sm text-white/70 hover:border-violet-400/40 hover:bg-violet-400/10 hover:text-white transition">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {entries.map((e) => (
          <div key={e.id} className="space-y-2">
            {/* Question bubble */}
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-sky-500/20 border border-sky-400/30 px-4 py-2.5 text-sm">
                {e.question}
              </div>
            </div>
            {/* Answer */}
            <div className="flex justify-start">
              <div className={glassCard("max-w-[88%] w-full p-4")}>
                {e.pending ? (
                  <div className="flex items-center gap-2 text-white/50"><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</div>
                ) : e.error ? (
                  <div className="text-rose-300 text-sm">{e.error}</div>
                ) : e.answer ? (
                  <AnswerCard a={e.answer} />
                ) : null}
              </div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <form onSubmit={(ev) => { ev.preventDefault(); void ask(q); }} className={glassCard("p-2 flex items-center gap-2")}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. How many deliveries failed this week?"
          className="flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-white/30"
        />
        <button type="submit" disabled={busy || !q.trim()}
          className="flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2 text-sm font-bold text-white hover:bg-violet-400 disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Ask
        </button>
      </form>
    </div>
  );
}

function AnswerCard({ a }: { a: CopilotAnswer }) {
  const big = a.unit && a.value != null && typeof a.value !== "string";
  return (
    <div>
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
        <p className="text-sm leading-relaxed text-white/85">{a.answer}</p>
      </div>

      {big && (
        <div className="mt-3 text-3xl font-black tracking-tight text-white">
          {formatValue(a.value as number, a.unit!)}
        </div>
      )}

      {a.chart && a.chart.values.length > 0 && <Chart chart={a.chart} unit={a.unit} />}

      {a.table && a.table.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.04] text-left text-[11px] uppercase tracking-wide text-white/40">
              <tr>{Object.keys(a.table[0]).map((k) => <th key={k} className="p-2.5">{k}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {a.table.map((row, i) => (
                <tr key={i}>{Object.values(row).map((v, j) => <td key={j} className="p-2.5 font-mono text-white/80">{String(v)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!a.matched && (
        <p className="mt-2 text-xs text-white/30">I couldn't map that to a known metric — try rephrasing, or use one of the suggested questions.</p>
      )}
      <div className="mt-2 text-[10px] uppercase tracking-wide text-white/25">{a.intent} · {a.tookMs}ms</div>
    </div>
  );
}

function formatValue(v: number, unit: string) {
  if (unit === "currency") return `R${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (unit === "percent") return `${v}%`;
  return Number(v).toLocaleString();
}

const PALETTE = ["#38bdf8", "#a78bfa", "#34d399", "#f472b6", "#fbbf24", "#f87171"];

function Chart({ chart, unit }: { chart: CopilotChart; unit?: string | null }) {
  const max = Math.max(...chart.values, 1);
  const fmt = (n: number) => (unit === "currency" ? `R${Math.round(n).toLocaleString()}` : n.toLocaleString());

  if (chart.type === "donut") {
    const total = chart.values.reduce((s, v) => s + v, 0) || 1;
    // Prefix sums (each entry includes its own value) — computed by reduction
    // so segment boundaries need no mutable accumulator during render.
    const prefix = chart.values.reduce<number[]>((arr, v) => [...arr, (arr[arr.length - 1] ?? 0) + v], []);
    const segs = chart.values.map((v, i) => {
      const end = (prefix[i] / total) * 100;
      return `${PALETTE[i % PALETTE.length]} ${end - (v / total) * 100}% ${end}%`;
    });
    return (
      <div className="mt-3 flex items-center gap-4">
        <div className="h-24 w-24 rounded-full" style={{ background: `conic-gradient(${segs.join(",")})` }}>
          <div className="m-auto grid h-full w-full place-items-center">
            <div className="h-14 w-14 rounded-full bg-[#0b1220]" />
          </div>
        </div>
        <div className="space-y-1">
          {chart.labels.map((l, i) => (
            <div key={l} className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="text-white/60">{l}</span>
              <span className="font-mono font-bold">{fmt(chart.values[i])}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (chart.type === "line") {
    const w = 520, h = 120, pad = 8;
    const step = chart.values.length > 1 ? (w - pad * 2) / (chart.values.length - 1) : 0;
    const pts = chart.values.map((v, i) => `${pad + i * step},${h - pad - (v / max) * (h - pad * 2)}`).join(" ");
    return (
      <div className="mt-3 overflow-x-auto">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-xl">
          <polyline points={pts} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {chart.values.map((v, i) => (
            <circle key={i} cx={pad + i * step} cy={h - pad - (v / max) * (h - pad * 2)} r="2.5" fill="#a78bfa" />
          ))}
        </svg>
        <div className="mt-1 flex justify-between text-[10px] text-white/30">
          <span>{chart.labels[0]}</span><span>{chart.labels[chart.labels.length - 1]}</span>
        </div>
      </div>
    );
  }

  // bar
  return (
    <div className="mt-3 space-y-1.5">
      {chart.labels.map((l, i) => (
        <div key={l} className="flex items-center gap-2">
          <div className="w-28 shrink-0 truncate text-xs text-white/60">{l}</div>
          <div className="h-5 flex-1 overflow-hidden rounded bg-white/5">
            <div className="h-full rounded" style={{ width: `${(chart.values[i] / max) * 100}%`, background: PALETTE[i % PALETTE.length] }} />
          </div>
          <div className="w-24 shrink-0 text-right font-mono text-xs">{fmt(chart.values[i])}</div>
        </div>
      ))}
    </div>
  );
}
