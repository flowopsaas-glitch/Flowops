import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ClipboardCheck,
  Image as ImageIcon,
  ScanLine,
  ShieldCheck,
  Sparkles,
  FileCheck2,
  Camera,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Bot
} from "lucide-react";
import { api } from '../api/client';
import DeliveryAction from './Deliveries/DeliveryAction'; // 🚀 Importing our signature logic

// 🏗️ Tile Component: Added onClick and hover states
function Tile(props: {
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  active?: boolean;
}) {
  const Icon = props.icon;
  return (
    <div 
      onClick={props.onClick}
      className={`group rounded-[26px] border border-white/10 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)] transition-all cursor-pointer 
      ${props.active ? 'bg-blue-500/10 border-blue-500/50' : 'bg-white/5 hover:bg-white/10'}`}
    >
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10 group-hover:ring-blue-500/30 transition-all">
        <Icon className={`h-5 w-5 ${props.active ? 'text-blue-400' : 'text-white'}`} />
      </div>
      <div className="mt-4 text-lg font-extrabold text-white flex items-center justify-between">
        {props.title}
        <ArrowUpRight size={16} className="opacity-0 group-hover:opacity-40 transition-opacity" />
      </div>
      <div className="mt-1 text-sm leading-relaxed text-white/65">{props.desc}</div>
    </div>
  );
}

export default function PodDeliveries() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<'overview' | 'queue'>('overview');
  const [waybills, setWaybills] = useState<any[]>([]);
  const [selectedWaybill, setSelectedWaybill] = useState<any | null>(null);
  const [aiReview, setAiReview] = useState<any | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  // 📡 Fetch pending waybills from the backend
  const fetchQueue = async () => {
    try {
      const data = await api.get<any, any>(`/waybills`);
      // Filter for those not yet delivered
      setWaybills(data.filter((w: any) => w.status !== 'DELIVERED'));
    } catch (err) {
      console.error("Failed to load POD queue", err);
    }
  };

  useEffect(() => {
    if (view === 'queue') fetchQueue();
  }, [view]);

  useEffect(() => {
    if (searchParams.get("waybillId")) {
      setView("queue");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!waybills.length) return;

    const requestedWaybillId = searchParams.get("waybillId");
    if (requestedWaybillId) {
      const requested = waybills.find((waybill) => String(waybill.id) === requestedWaybillId);
      if (requested && String(selectedWaybill?.id) !== String(requested.id)) {
        setSelectedWaybill(requested);
      }
    }
  }, [waybills, searchParams, selectedWaybill?.id]);

  useEffect(() => {
    if (!selectedWaybill?.id) {
      setAiReview(null);
      return;
    }

    let active = true;
    async function loadAssist() {
      try {
        setReviewLoading(true);
        const data = await api.get<any, any>(`/waybills/${selectedWaybill.id}/assist`);
        if (active) setAiReview(data);
      } catch {
        if (active) setAiReview(null);
      } finally {
        if (active) setReviewLoading(false);
      }
    }

    void loadAssist();
    return () => {
      active = false;
    };
  }, [selectedWaybill?.id]);

  useEffect(() => {
    if (!selectedWaybill?.id) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("waybillId", String(selectedWaybill.id));
      return next;
    });
  }, [selectedWaybill?.id, setSearchParams]);

  // --- 🧊 SUB-VIEW: THE LIVE QUEUE ---
  if (view === 'queue') {
    return (
      <div className="min-h-full bg-[#07111f] p-6 sm:p-8 animate-in fade-in slide-in-from-right-4 duration-300">
        <button 
          onClick={() => { setView('overview'); setSelectedWaybill(null); }}
          className="flex items-center gap-2 text-white/50 hover:text-white transition-colors font-bold text-xs uppercase tracking-widest mb-8"
        >
          <ChevronLeft size={16} /> Back to Overview
        </button>

        {selectedWaybill ? (
          <div className="mx-auto grid max-w-[1200px] gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <DeliveryAction 
              waybillId={selectedWaybill.id} 
              waybillNumber={selectedWaybill.waybillNumber} 
              onSuccess={() => { setSelectedWaybill(null); fetchQueue(); }} 
            />

            <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.30)]">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Bot className="h-5 w-5 text-blue-400" />
                Z AI POD Quality Review
              </div>
              <div className="mt-1 text-sm text-white/70">
                Checks delivery evidence strength before billing and exception closure.
              </div>

              {reviewLoading ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/65">
                  Reviewing POD evidence...
                </div>
              ) : aiReview ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-[22px] border border-blue-500/20 bg-blue-500/10 p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-300">Completeness</div>
                    <div className="mt-2 text-4xl font-black text-white">{aiReview.completenessScore}</div>
                    <div className={`mt-3 inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase ${
                      aiReview.podReady ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
                    }`}>
                      {aiReview.podReady ? "POD Ready" : "Needs More Evidence"}
                    </div>
                  </div>

                  <AssistList title="Blocking Issues" items={aiReview.blockingIssues?.length ? aiReview.blockingIssues : ["No blocking issues detected."]} />
                  <AssistList title="Warnings" items={aiReview.warnings?.length ? aiReview.warnings : ["No POD warnings detected."]} />
                  <AssistList title="Suggestions" items={aiReview.suggestions?.length ? aiReview.suggestions : ["No extra suggestions from Z AI."]} />

                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/invoice-drafts?sourceWaybill=${encodeURIComponent(
                          selectedWaybill.waybillNumber || ""
                        )}&waybillId=${encodeURIComponent(String(selectedWaybill.id))}`
                      )
                    }
                    className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
                  >
                    Open Invoice Drafts
                  </button>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/65">
                  No AI review available for this waybill yet.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-[800px] space-y-4">
            <h2 className="text-3xl font-black text-white mb-6">Active POD Queue</h2>
            {waybills.length === 0 ? (
              <div className="rounded-[30px] border border-white/5 bg-white/2 p-20 text-center text-white/30">
                All deliveries captured. System synchronized.
              </div>
            ) : (
              waybills.map(wb => (
                <div 
                  key={wb.id} 
                  onClick={() => setSelectedWaybill(wb)}
                  className="group flex items-center justify-between rounded-[22px] border border-white/10 bg-white/5 p-5 hover:bg-white/10 transition-all cursor-pointer"
                >
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">Waybill</span>
                    <h4 className="text-xl font-mono text-white">{wb.waybillNumber}</h4>
                    <p className="text-sm text-white/50">Destination: {wb.recipient || 'Unknown'}</p>
                  </div>
                  <ChevronRight className="text-white/20 group-hover:text-white group-hover:translate-x-1 transition-all" />
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  // --- 🏛️ MAIN VIEW: THE DASHBOARD ---
  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(31,104,140,0.18),transparent_30%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 overflow-y-auto">
      <div className="mx-auto max-w-[1600px] space-y-6">
        
        {/* Header Block */}
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/85 ring-1 ring-white/15">
            <ClipboardCheck className="h-4 w-4" />
            POD & Delivery Evidence Control
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">POD / Deliveries</h1>
          <p className="mt-2 max-w-4xl text-sm text-white/72 leading-relaxed">
            Manage proof-of-delivery intake, scan-station capture, WhatsApp-delivered evidence,
            and AI-assisted matching back to the correct shipment, client, and invoice flow.
          </p>
        </div>

        {/* Tiles Grid */}
        <div className="grid gap-4 lg:grid-cols-4">
          <Tile
            title="POD Queue"
            desc="Track incoming proof-of-delivery files and evidence waiting for review."
            icon={FileCheck2}
            onClick={() => setView('queue')}
          />
          <Tile title="Image Intake" desc="Accept delivery photos and uploaded POD images." icon={ImageIcon} />
          <Tile title="Scan Station" desc="Support manual office scan workflows for paperwork." icon={ScanLine} />
          <Tile title="Evidence Health" desc="Surface missing or weak delivery evidence." icon={ShieldCheck} />
        </div>

        {/* Footer Info Sections */}
        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.30)]">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Camera className="h-5 w-5 text-blue-400" />
              Delivery evidence flow
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-white/60 leading-relaxed">
                POD evidence should come from multiple channels: drivers, WhatsApp, uploaded files, and manual scanning.
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-white/60 leading-relaxed">
                Every POD should eventually link to the right shipment, tenant client, and invoice confidence score.
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.30)]">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Sparkles className="h-5 w-5 text-purple-400" />
              Next upgrade
            </div>
            <div className="mt-4 space-y-2">
              {[
                "Live POD queue",
                "Missing POD dashboard",
                "Manual scan-station upload",
                "AI POD-to-waybill matching",
              ].map((item) => (
                <div key={item} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/10 px-4 py-2 text-[11px] font-bold text-white/50 uppercase tracking-widest">
                  {item}
                  <ArrowUpRight className="h-3 w-3 opacity-20" />
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function AssistList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">{title}</div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item} className="text-sm text-white/80">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
