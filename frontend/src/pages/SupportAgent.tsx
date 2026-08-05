import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LifeBuoy, Send, Loader2, Bot, Crown, Ticket, Check, AlertTriangle,
  BookOpen, Sparkles, X, ChevronRight, Activity,
} from "lucide-react";
import { useToast } from "../components/ToastProvider";
import { cn } from "../lib/utils";
import { getEntitlements } from "../api/billingApi";
import {
  askSupport, getSupportSuggestions, createSupportTicket, listSupportTickets,
  type SupportAnswer, type SupportTicket, type ChatTurn,
} from "../api/supportApi";

const glassCard = (c?: string) =>
  cn("rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-xl", c);

type Entry = { id: number; question: string; answer?: SupportAnswer; pending?: boolean; error?: string };

const STATUS_CLS: Record<string, string> = {
  OPEN: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  IN_PROGRESS: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  RESOLVED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  CLOSED: "border-white/15 bg-white/5 text-white/50",
};

function confidenceCls(c: number) {
  if (c >= 70) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (c >= 40) return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-rose-500/30 bg-rose-500/10 text-rose-300";
}

export default function SupportAgent() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [entitled, setEntitled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [showTickets, setShowTickets] = useState(false);
  const [escalateFor, setEscalateFor] = useState<Entry | null>(null);

  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const ent = await getEntitlements().catch(() => null);
        const ok = !!ent?.features?.aiSupportAgent;
        setEntitled(ok);
        if (ok) {
          getSupportSuggestions().then(setSuggestions).catch(() => {});
          listSupportTickets().then(setTickets).catch(() => {});
        }
      } catch {
        setEntitled(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [entries]);

  function buildHistory(): ChatTurn[] {
    const h: ChatTurn[] = [];
    for (const e of entries) {
      if (e.answer) {
        h.push({ role: "user", content: e.question });
        h.push({ role: "assistant", content: e.answer.answer });
      }
    }
    return h.slice(-6);
  }

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setQ("");
    const id = Date.now();
    const history = buildHistory();
    setEntries((e) => [...e, { id, question: text, pending: true }]);
    setBusy(true);
    try {
      const answer = await askSupport(text, history);
      setEntries((e) => e.map((x) => (x.id === id ? { ...x, answer, pending: false } : x)));
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || "Something went wrong";
      setEntries((e) => e.map((x) => (x.id === id ? { ...x, error: msg, pending: false } : x)));
      showToast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  async function submitEscalation(subject: string, message: string, priority: "low" | "normal" | "high") {
    try {
      const transcript = entries
        .filter((e) => e.answer)
        .map((e) => ({ q: e.question, a: e.answer?.answer }));
      const t = await createSupportTicket({
        subject: subject.slice(0, 160),
        message,
        priority,
        category: escalateFor?.answer?.category,
        aiSummary: escalateFor?.answer?.answer?.slice(0, 400),
        transcript,
      });
      setTickets((prev) => [t, ...prev]);
      setEscalateFor(null);
      setShowTickets(true);
      showToast("Support ticket raised — our team will follow up.", "success");
    } catch (e: any) {
      showToast(e?.response?.data?.message || e?.message || "Could not raise ticket", "error");
    }
  }

  if (loading) {
    return <div className="min-h-full grid place-items-center"><Loader2 className="h-7 w-7 animate-spin text-white/40" /></div>;
  }

  if (!entitled) {
    return (
      <div className="min-h-full p-8">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-cyan-500/30 bg-cyan-500/8 p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cyan-500/15 ring-1 ring-cyan-500/30">
            <LifeBuoy className="h-7 w-7 text-cyan-300" />
          </div>
          <h1 className="mt-4 text-2xl font-black text-white">AI Support Agent</h1>
          <p className="mt-2 text-sm text-white/60">
            An always-on assistant that answers product questions <span className="text-white/80">and</span> your live
            operational data, then escalates to a tracked ticket when it can't fully help. Available on the{" "}
            <span className="font-bold text-cyan-300">Enterprise</span> plan.
          </p>
          <button onClick={() => navigate("/billing/plans")} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/20 px-5 py-2.5 text-sm font-black text-cyan-200 hover:bg-cyan-500/30 transition">
            <Crown className="h-4 w-4" /> See Enterprise plan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-4 md:p-8 text-white">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-cyan-500/30 to-sky-500/20 text-cyan-200">
          <LifeBuoy className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight">AI Support Agent</h1>
          <p className="text-sm text-white/50">Product help + your live operation, with a human escalation when needed.</p>
        </div>
        <button
          onClick={() => setShowTickets((v) => !v)}
          className="ml-auto flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-bold text-white/70 hover:bg-white/10 transition"
        >
          <Ticket className="h-4 w-4" /> My tickets
          {tickets.length > 0 && <span className="rounded-full bg-cyan-500/20 px-1.5 text-[11px] text-cyan-200">{tickets.length}</span>}
        </button>
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Chat column */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto pb-4">
            {entries.length === 0 && (
              <div className={glassCard("p-8 text-center")}>
                <Bot className="mx-auto h-10 w-10 text-cyan-300/70" />
                <p className="mt-3 text-lg font-bold">How can I help?</p>
                <p className="mt-1 text-sm text-white/40">Ask about using FlowOps, or about your live operation:</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {suggestions.map((s) => (
                    <button key={s} onClick={() => void ask(s)}
                      className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-sm text-white/70 hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-white transition">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {entries.map((e) => (
              <div key={e.id} className="space-y-2">
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-sky-500/20 border border-sky-400/30 px-4 py-2.5 text-sm">{e.question}</div>
                </div>
                <div className="flex justify-start">
                  <div className={glassCard("max-w-[90%] w-full p-4")}>
                    {e.pending ? (
                      <div className="flex items-center gap-2 text-white/50"><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</div>
                    ) : e.error ? (
                      <div className="text-rose-300 text-sm">{e.error}</div>
                    ) : e.answer ? (
                      <AnswerCard a={e.answer} onFollowUp={(f) => void ask(f)} onEscalate={() => setEscalateFor(e)} />
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <form onSubmit={(ev) => { ev.preventDefault(); void ask(q); }} className={glassCard("p-2 flex items-center gap-2")}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ask the FlowOps support agent…"
              className="flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-white/30"
            />
            <button type="submit" disabled={busy || !q.trim()}
              className="flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-400 disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
            </button>
          </form>
        </div>

        {/* Tickets drawer */}
        {showTickets && (
          <div className={glassCard("hidden w-80 shrink-0 flex-col overflow-hidden p-4 lg:flex")}>
            <div className="mb-3 flex items-center gap-2">
              <Ticket className="h-4 w-4 text-cyan-300" />
              <h2 className="text-sm font-black uppercase tracking-wider text-white/70">Support tickets</h2>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto">
              {tickets.length === 0 ? (
                <p className="text-xs text-white/30 py-6 text-center">No tickets yet. When the agent can't fully help, escalate and it'll appear here.</p>
              ) : tickets.map((t) => (
                <div key={t.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${STATUS_CLS[t.status] || STATUS_CLS.OPEN}`}>{t.status.replace("_", " ")}</span>
                    <span className="ml-auto text-[10px] text-white/30">{new Date(t.createdAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-bold text-white/85 leading-snug">{t.subject}</p>
                  {t.category && <span className="mt-1 inline-block text-[10px] text-white/35">#{t.category}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {escalateFor && (
        <EscalateModal
          defaultSubject={escalateFor.question}
          defaultMessage={`I need more help with:\n\n"${escalateFor.question}"\n\nThe assistant suggested:\n${escalateFor.answer?.answer ?? ""}`}
          onClose={() => setEscalateFor(null)}
          onSubmit={submitEscalation}
        />
      )}
    </div>
  );
}

function AnswerCard({ a, onFollowUp, onEscalate }: { a: SupportAnswer; onFollowUp: (f: string) => void; onEscalate: () => void }) {
  return (
    <div>
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
        <p className="text-sm leading-relaxed text-white/85 whitespace-pre-wrap">{a.answer}</p>
      </div>

      {a.live && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-sky-500/20 bg-sky-500/[0.06] px-3 py-2">
          <Activity className="h-4 w-4 shrink-0 text-sky-300" />
          <span className="text-xs text-white/70">{a.live.answer}</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-white/30">live data</span>
        </div>
      )}

      {a.relatedHelp.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5 text-white/30" />
          {a.relatedHelp.map((h) => (
            <span key={h.id} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/55">{h.title}</span>
          ))}
        </div>
      )}

      {a.suggestedFollowUps.length > 0 && (
        <div className="mt-3 space-y-1">
          {a.suggestedFollowUps.map((f) => (
            <button key={f} onClick={() => onFollowUp(f)}
              className="flex w-full items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-left text-xs text-white/60 hover:bg-white/[0.07] hover:text-white transition">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-cyan-300/60" /> {f}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <span title="How confident the agent is in this answer" className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${confidenceCls(a.confidence)}`}>
          {a.confidence}% confident
        </span>
        {a.shouldEscalate && (
          <button onClick={onEscalate} className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-500/20 transition">
            <AlertTriangle className="h-3.5 w-3.5" /> Escalate to a human
          </button>
        )}
        {!a.shouldEscalate && (
          <button onClick={onEscalate} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-white/50 hover:bg-white/10 hover:text-white transition">
            <Ticket className="h-3.5 w-3.5" /> Raise a ticket
          </button>
        )}
      </div>
    </div>
  );
}

function EscalateModal({
  defaultSubject, defaultMessage, onClose, onSubmit,
}: {
  defaultSubject: string;
  defaultMessage: string;
  onClose: () => void;
  onSubmit: (subject: string, message: string, priority: "low" | "normal" | "high") => void;
}) {
  const [subject, setSubject] = useState(defaultSubject.slice(0, 160));
  const [message, setMessage] = useState(defaultMessage);
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className={glassCard("w-full max-w-lg p-5")} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Ticket className="h-5 w-5 text-cyan-300" />
          <h2 className="text-lg font-black">Raise a support ticket</h2>
          <button onClick={onClose} className="ml-auto text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <p className="mt-1 text-xs text-white/40">Our team picks this up with the full conversation attached.</p>

        <label className="mt-4 block text-[11px] font-bold uppercase tracking-wider text-white/40">Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan-400/40" />

        <label className="mt-3 block text-[11px] font-bold uppercase tracking-wider text-white/40">Details</label>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan-400/40 resize-y" />

        <label className="mt-3 block text-[11px] font-bold uppercase tracking-wider text-white/40">Priority</label>
        <div className="mt-1 flex gap-2">
          {(["low", "normal", "high"] as const).map((p) => (
            <button key={p} onClick={() => setPriority(p)} className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-bold capitalize transition",
              priority === p ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-200" : "border-white/10 bg-white/5 text-white/50 hover:text-white",
            )}>{p}</button>
          ))}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white/60 hover:text-white">Cancel</button>
          <button
            disabled={saving || !subject.trim() || !message.trim()}
            onClick={() => { setSaving(true); onSubmit(subject, message, priority); }}
            className="flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-400 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Raise ticket
          </button>
        </div>
      </div>
    </div>
  );
}
