import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { api } from '../api/client';
import { formatMoney } from "../lib/currency";
import {
  ScanLine, Box,
  Zap, Trash2, UploadCloud, Banknote, MapPin, Building2, Hash, ZoomIn, Package, FileText, Printer,
  type LucideIcon,
} from "lucide-react";
import { usePremiumWebSocket } from "../hooks/usePremiumWebSocket";
import { useToast } from "../components/toast-context";
import { printWaybillLabel } from "../lib/labelPrint";
import { FLOWOPS_HTTP_ORIGIN } from "../lib/env";
const tenantCurrency = () => window.__FLOWOPS_CURRENCY__ ?? 'ZAR';

const RATE_PER_KG = 700;

function ImageMagnifier({ src, className }: { src: string; className?: string }) {
  const [[x, y], setXY] = useState([0, 0]);
  const [[imgWidth, imgHeight], setSize] = useState([0, 0]);
  const [showMagnifier, setShowMagnifier] = useState(false);
  const magnifierHeight = 220;
  const magnifierWidth = 220;
  const zoomLevel = 2.8;

  return (
    <div className={`relative inline-block overflow-hidden rounded-[40px] ${className}`} style={{ height: '100%', width: '100%' }}>
      <img
        src={src}
        className="w-full h-full object-contain cursor-crosshair"
        alt="Waybill Scan"
        onMouseEnter={(e) => {
          const elem = e.currentTarget;
          const { width, height } = elem.getBoundingClientRect();
          setSize([width, height]);
          setShowMagnifier(true);
        }}
        onMouseMove={(e) => {
          const elem = e.currentTarget;
          const { top, left } = elem.getBoundingClientRect();
          const x = e.pageX - left - window.pageXOffset;
          const y = e.pageY - top - window.pageYOffset;
          setXY([x, y]);
        }}
        onMouseLeave={() => setShowMagnifier(false)}
      />

      {showMagnifier && (
        <div
          style={{
            display: "block",
            pointerEvents: "none",
            height: `${magnifierHeight}px`,
            width: `${magnifierWidth}px`,
            top: `${y - magnifierHeight / 2}px`,
            left: `${x - magnifierWidth / 2}px`,
            opacity: "1",
            border: "3px solid rgba(14, 165, 233, 0.6)",
            backgroundColor: "#0f172a",
            backgroundImage: `url('${src}')`,
            backgroundRepeat: "no-repeat",
            backgroundSize: `${imgWidth * zoomLevel}px ${imgHeight * zoomLevel}px`,
            backgroundPosition: `${-x * zoomLevel + magnifierWidth / 2}px ${-y * zoomLevel + magnifierHeight / 2}px`,
            borderRadius: "50%",
            position: "absolute",
            boxShadow: "0 0 40px rgba(0,0,0,0.9)",
            zIndex: 50
          }}
        />
      )}
    </div>
  );
}


type InboxExtracted = {
  waybillNumber?: string; weight?: string | number; quantity?: string | number;
  totalAmount?: string | number; paymentType?: string; payer?: string;
  senderName?: string; senderAddress?: string; sender?: string;
  recipientName?: string; recipientAddress?: string; recipient?: string; deliveryAddress?: string;
};
type InboxItem = {
  id: number;
  waybillNumber?: string;
  fileUrl?: string;
  extractedData?: InboxExtracted;
  weight?: string | number;
  quantity?: string | number;
  totalAmount?: string | number;
  paymentType?: string;
  billTo?: string;
  contractId?: string;
};

export default function WaybillInbox() {

  const [items, setItems] = useState<InboxItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'DOCUMENT' | 'PARCELS' | 'AI'>('DOCUMENT');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editForm, setEditForm] = useState({
    waybillNumber: "",
    weight: "0.5",
    quantity: "1",
    totalAmount: "350.00",
    paymentType: "CONTRACT",
    billTo: "SENDER",
    contractId: "",
    senderName: "", senderAddress: "", recipientName: "", recipientAddress: "",
  });

  const assetBase = FLOWOPS_HTTP_ORIGIN;
  const selectedItem = useMemo(() => Array.isArray(items) ? items.find(i => i.id === selectedId) : null, [items, selectedId]);

  // 🔴 Real-time: new inbox item arrives → refresh the list
  usePremiumWebSocket({
    onEvent: (event: { type?: string }) => {
      if (event?.type === "inbox:new" || event?.type === "waybill:inbox") {
        void fetchData();
      }
    },
  });

  // Initialize the edit form when a different inbox item is selected.
  // Adjusting during render (keyed on the item's identity) replaces the
  // former effect, which re-ran — and discarded edits — on every list refresh.
  const [editFormItem, setEditFormItem] = useState<InboxItem | null>(null);
  if (selectedItem && selectedItem !== editFormItem) {
    setEditFormItem(selectedItem);
    {
      const ai = selectedItem.extractedData || {};
      const rawWeight = parseFloat(String(selectedItem.weight || ai.weight || 0.5));
      const rawAmount = parseFloat(String(selectedItem.totalAmount || ai.totalAmount || (rawWeight * RATE_PER_KG)));

      setEditForm({
        waybillNumber: String(selectedItem.waybillNumber || ai.waybillNumber || ""),
        weight: rawWeight.toString(),
        quantity: String(selectedItem.quantity || ai.quantity || "1"),
        totalAmount: rawAmount.toFixed(2),
        paymentType: selectedItem.paymentType || ai.paymentType || "CONTRACT",
        billTo: selectedItem.billTo || ai.payer || "SENDER",
        contractId: selectedItem.contractId || (String(ai.senderName || "").includes("DCB") ? "dcb_001" : ""),
        senderName: String(ai.senderName || ai.sender || ""),
        senderAddress: String(ai.senderAddress || ""),
        recipientName: String(ai.recipientName || ai.recipient || ""),
        recipientAddress: String(ai.recipientAddress || ai.deliveryAddress || ""),
      });
    }
  }

  const handleAmountChange = (val: string) => {
    const amt = parseFloat(val) || 0;
    const calcWeight = amt / RATE_PER_KG;
    setEditForm(prev => ({ ...prev, totalAmount: val, weight: calcWeight.toFixed(2) }));
  };

  const handleWeightChange = (val: string) => {
    const w = parseFloat(val) || 0;
    const calcAmt = w * RATE_PER_KG;
    setEditForm(prev => ({ ...prev, weight: val, totalAmount: calcAmt.toFixed(2) }));
  };

  const { showToast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get("/waybills/inbox");
      const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
      setItems(list);
      if (list.length > 0 && selectedId === null) setSelectedId(list[0].id);
    } catch (err) { console.error("Inbox Fetch Failed:", err); }
  }, [selectedId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleApprove = async (opts?: { print?: boolean }) => {
    if (!selectedItem) return;
    try {
      const res = await api.post(`/waybills/inbox/${selectedItem.id}/commit`, editForm);
      const wb = res?.data ?? res;
      const tn = wb?.trackingNumber ? ` ${wb.trackingNumber}` : "";
      if (opts?.print && wb?.id) {
        showToast(`Committed${tn} — opening label…`, "success");
        try {
          await printWaybillLabel(wb.id);
        } catch {
          showToast("Committed, but the label could not be generated. Print it later from Shipments.", "error");
        }
      } else {
        showToast(`Committed${tn}.`, "success");
      }
      setSelectedId(null);
      fetchData();
    } catch { showToast("Commit failed.", "error"); }
  };

  return (
    <div className="flex h-screen bg-[#020817] text-slate-200 overflow-hidden text-left font-sans">

      {/* 🟦 LEFT: QUEUE */}
      <div className="w-[320px] border-r border-white/5 flex flex-col bg-slate-950/50 backdrop-blur-xl">
        <div className="p-8 border-b border-white/5 flex justify-between items-center">
          <h1 className="text-xl font-black text-white tracking-tighter flex items-center gap-2"><ScanLine className="text-sky-500" size={20} /> INBOX</h1>
          <button onClick={() => fileInputRef.current?.click()} className="text-sky-400 p-2 hover:bg-sky-500/10 rounded-xl border border-sky-500/20"><UploadCloud size={18} /></button>
          <input type="file" ref={fileInputRef} className="hidden" onChange={async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            const fd = new FormData(); fd.append("file", file);
            await api.post("/waybills/inbox/upload", fd); fetchData();
          }} />
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {items.map((item) => (
            <button key={item.id} onClick={() => { setSelectedId(item.id); setActiveTab('DOCUMENT'); }} className={`w-full p-5 rounded-[28px] border text-left transition-all fx-lift ${selectedId === item.id ? 'bg-sky-600 border-sky-400 shadow-xl' : 'bg-slate-900/40 border-white/5'}`}>
              <div className="text-[9px] font-black uppercase text-white/30 mb-1">Entry #{item.id}</div>
              <div className="font-bold text-white truncate text-sm">{item.waybillNumber || "Unidentified Job"}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 🟦 CENTER: TABBED WORKSPACE */}
      <div className="flex-1 p-8 flex flex-col bg-black/20 overflow-hidden">
        {selectedItem ? (
          <div className="h-full flex flex-col">

            {/* Navigation Tabs */}
            <div className="mb-6 flex justify-between items-center">
              <div className="flex bg-slate-900/80 p-1.5 rounded-2xl border border-white/5 shadow-inner">
                 <TabButton active={activeTab === 'DOCUMENT'} onClick={() => setActiveTab('DOCUMENT')} icon={FileText} label="Scan" />
                 <TabButton active={activeTab === 'PARCELS'} onClick={() => setActiveTab('PARCELS')} icon={Package} label="Parcels" />
                 <TabButton active={activeTab === 'AI'} onClick={() => setActiveTab('AI')} icon={Zap} label="AI" />
              </div>

              <div className="flex gap-3">
                <button onClick={() => { if(window.confirm("Reject document?")) api.delete(`/waybills/inbox/${selectedItem.id}`).then(() => fetchData()).catch(() => showToast("Failed to reject document. Please try again.", "error")) }} className="bg-red-500/10 text-red-500 p-4 rounded-2xl border border-red-500/20"><Trash2 size={18} /></button>
                <button onClick={() => void handleApprove()} className="bg-white/5 hover:bg-white/10 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase border border-white/10 transition-all">Commit</button>
                <button onClick={() => void handleApprove({ print: true })} className="bg-sky-500 hover:bg-sky-400 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase shadow-2xl transition-all inline-flex items-center gap-2"><Printer size={16} /> Commit &amp; Print</button>
              </div>
            </div>

            {/* Workspace Area */}
            <div className="flex-1 bg-slate-900/40 rounded-[48px] border border-white/10 overflow-hidden shadow-2xl relative">

               {activeTab === 'DOCUMENT' && (
                  <div className="h-full w-full p-8 flex items-center justify-center bg-slate-900/50">
                    <div className="w-full h-full relative">
                      <ImageMagnifier src={`${assetBase}${selectedItem.fileUrl}`} />
                      <div className="absolute top-4 left-4 bg-sky-500/20 text-sky-400 px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest backdrop-blur-md flex items-center gap-2">
                        <ZoomIn size={12} /> Hover image to zoom
                      </div>
                    </div>
                  </div>
               )}

               {activeTab === 'PARCELS' && (
                  <div className="h-full w-full p-10 overflow-y-auto custom-scrollbar">
                     <div className="grid grid-cols-2 gap-8">
                        {/* Evidence Photos */}
                        {[1, 2].map(idx => (
                          <div key={idx} className="aspect-video bg-white/5 rounded-[32px] border border-white/5 overflow-hidden group shadow-lg relative">
                            <img src={`${assetBase}${selectedItem.fileUrl}`} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" alt="Parcel" />
                            <div className="absolute top-4 right-4 bg-black/40 px-3 py-1 rounded-full text-[10px] font-bold text-white uppercase">Item {idx} of {editForm.quantity}</div>
                          </div>
                        ))}
                     </div>
                  </div>
               )}

               {activeTab === 'AI' && (
                  <div className="h-full w-full flex items-center justify-center p-12">
                     <div className="max-w-2xl w-full bg-slate-950/50 p-12 rounded-[48px] border border-sky-500/20 shadow-2xl text-left">
                        <div className="flex items-center gap-6 mb-12">
                          <div className="p-6 bg-sky-500/20 rounded-3xl text-sky-400 shadow-inner"><Zap size={40} /></div>
                          <div>
                            <h4 className="text-3xl font-black text-white uppercase tracking-tighter italic">Deep AI Audit</h4>
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Status: Confidence Verified</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-y-12 gap-x-16">
                           <SummaryItem label="Waybill Ref" value={editForm.waybillNumber} />
                           <SummaryItem label="Total Cost" value={formatMoney(Number(editForm.totalAmount) || 0, tenantCurrency())} color="text-emerald-400" />
                           <SummaryItem label="Weight / Qty" value={`${editForm.weight}KG / ${editForm.quantity} PK`} />
                           <SummaryItem label="Payer" value={editForm.billTo} />
                        </div>
                     </div>
                  </div>
               )}
            </div>

          </div>
        ) : (
          <div className="m-auto text-center opacity-20"><Box size={64} className="mx-auto mb-4" /><p className="text-[10px] font-black uppercase tracking-widest">Select a Document</p></div>
        )}
      </div>

      {/* 🟦 RIGHT: SIDEBAR */}
      {selectedItem && (
        <div key={selectedId} className="w-[450px] border-l border-white/5 bg-slate-950/50 p-8 overflow-y-auto custom-scrollbar">
          <div className="space-y-8 pb-10">

            {/* FINANCIALS & LOGISTICS */}
            <section className="space-y-5 p-6 bg-white/5 rounded-[32px] border border-white/10 shadow-inner">
              <TriageField icon={Hash} label="Waybill Reference" value={editForm.waybillNumber} onChange={(v) => setEditForm({...editForm, waybillNumber: v})} />

              <div className="space-y-2 text-left">
                <label className="text-[10px] font-black text-emerald-500 uppercase flex items-center gap-2" htmlFor="field-chargeable-amount-zar-1"><Banknote size={12}/> Chargeable Amount (ZAR)</label>
                <div className="relative">
                  <span className="absolute left-4 top-4 text-slate-500 text-sm font-bold">R</span>
                  <input id="field-chargeable-amount-zar-1" type="number" value={editForm.totalAmount} onChange={(e) => handleAmountChange(e.target.value)}
                    className="w-full bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 pl-8 text-emerald-400 font-black text-xl outline-none focus:border-emerald-500 transition-all" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <TriageField icon={Package} label="Weight (KG)" value={editForm.weight} type="number" onChange={(v) => handleWeightChange(v)} />
                <TriageField icon={Box} label="Quantity" value={editForm.quantity} type="number" onChange={(v) => setEditForm({...editForm, quantity: v})} />
              </div>

              <TriageSelect label="Billing Account" value={editForm.contractId} onChange={(v) => setEditForm({...editForm, contractId: v})}
                options={[ {label: "Select Contract...", value: ""}, {label: "DCB Logistics (DCB-001)", value: "dcb_001"}, {label: "Standard Cash", value: "cash_001"} ]} />
            </section>

            {/* ENTITIES */}
            <section className="space-y-6">
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-sky-500 uppercase flex items-center gap-2 text-left"><Building2 size={14} /> Origin / Sender</h4>
                <TriageField icon={Building2} label="Sender" value={editForm.senderName} onChange={(v) => setEditForm({...editForm, senderName: v})} />
                <TriageField icon={MapPin} label="Pickup Address" value={editForm.senderAddress} onChange={(v) => setEditForm({...editForm, senderAddress: v})} />
              </div>

              <div className="h-px bg-white/5 mx-4" />

              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-amber-500 uppercase flex items-center gap-2 text-left"><MapPin size={14} /> Destination / Recipient</h4>
                <TriageField icon={Building2} label="Recipient" value={editForm.recipientName} onChange={(v) => setEditForm({...editForm, recipientName: v})} />
                <TriageField icon={MapPin} label="Delivery Address" value={editForm.recipientAddress} onChange={(v) => setEditForm({...editForm, recipientAddress: v})} />
              </div>
            </section>

          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}</style>
    </div>
  );
}

// --- HELPERS ---

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: LucideIcon; label: string }) {
  return (
    <button onClick={onClick} className={`px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all ${active ? 'bg-sky-500 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
      <Icon size={14} />
      <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
    </button>
  );
}

function SummaryItem({ label, value, color = "text-white" }: { label: string; value: unknown; color?: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[9px] font-black text-sky-500 uppercase tracking-widest">{label}</div>
      <div className={`text-xl font-black uppercase truncate ${color}`}>{String(value || "---")}</div>
    </div>
  );
}

function TriageField({ label, value, onChange, type = "text", icon: Icon }: { label: string; value: unknown; onChange: (v: string) => void; type?: string; icon?: LucideIcon }) {
  return (
    <div className="space-y-1.5 text-left">
      <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1">{label}</label>
      <div className="relative">
        {Icon && <Icon size={14} className="absolute left-4 top-4 text-slate-500" />}
        <input type={type} value={String(value || "")} onChange={(e) => onChange(e.target.value)}
          className={`w-full bg-white/5 border border-white/10 rounded-2xl p-4 ${Icon ? 'pl-11' : ''} text-white font-bold text-xs focus:border-sky-500 outline-none transition-all`} />
      </div>
    </div>
  );
}

function TriageSelect({ label, value, onChange, options }: { label: string; value: unknown; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="space-y-1.5 flex-1 text-left">
      <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1">{label}</label>
      <select value={String(value || "")} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-900 border border-white/10 rounded-2xl p-4 text-white font-bold text-xs outline-none cursor-pointer appearance-none">
        {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </div>
  );
}
