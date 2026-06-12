import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import DeliveryAction from './DeliveryAction';
import { LayoutGrid, ClipboardList, Image as ImageIcon, ScanLine, ShieldCheck, ChevronRight } from 'lucide-react';

const PODDeliveries = () => {
  // 🕹️ View State: 'landing' | 'queue'
  const [view, setView] = useState<'landing' | 'queue'>('landing');
  const [waybills, setWaybills] = useState<any[]>([]);
  const [selectedWaybill, setSelectedWaybill] = useState<any | null>(null);

  const fetchQueue = async () => {
    try {
      const data = await api.get<any, any>(`/waybills`);
      setWaybills(data.filter((w: any) => w.status !== 'DELIVERED'));
    } catch (err) {
      console.error("Failed to load queue", err);
    }
  };

  useEffect(() => { if (view === 'queue') fetchQueue(); }, [view]);

  // --- SUB-VIEW: THE DASHBOARD LANDING ---
  const LandingView = () => (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <div className="flex items-center gap-2 text-slate-400 mb-2">
          <ShieldCheck size={16} className="text-blue-500" />
          <span className="text-xs font-bold uppercase tracking-widest">POD & Delivery Evidence Control</span>
        </div>
        <h1 className="text-4xl font-black text-white mb-2">POD / Deliveries</h1>
        <p className="text-slate-400 max-w-2xl">Manage proof-of-delivery intake, scan-station capture, WhatsApp-delivered evidence, and AI-assisted matching.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* 🚀 This is the card we are wiring up! */}
        <button onClick={() => setView('queue')} className="bg-[#1e293b]/50 border border-slate-800 p-6 rounded-2xl text-left hover:border-blue-500 transition-all group">
          <ClipboardList className="text-blue-500 mb-4 group-hover:scale-110 transition-transform" />
          <h3 className="text-white font-bold mb-1">POD Queue</h3>
          <p className="text-xs text-slate-500">Track incoming proof-of-delivery files and evidence waiting for review.</p>
        </button>

        <div className="bg-[#1e293b]/30 border border-slate-800 p-6 rounded-2xl opacity-50 cursor-not-allowed">
          <ImageIcon className="text-slate-500 mb-4" />
          <h3 className="text-white font-bold mb-1">Image Intake</h3>
          <p className="text-xs text-slate-500">Accept delivery photos, signed documents, and uploaded images.</p>
        </div>

        <div className="bg-[#1e293b]/30 border border-slate-800 p-6 rounded-2xl opacity-50 cursor-not-allowed">
          <ScanLine className="text-slate-500 mb-4" />
          <h3 className="text-white font-bold mb-1">Scan Station</h3>
          <p className="text-xs text-slate-500">Support manual office scan workflows for printed paperwork.</p>
        </div>

        <div className="bg-[#1e293b]/30 border border-slate-800 p-6 rounded-2xl opacity-50 cursor-not-allowed">
          <ShieldCheck className="text-slate-500 mb-4" />
          <h3 className="text-white font-bold mb-1">Evidence Health</h3>
          <p className="text-xs text-slate-500">Surface missing or weak delivery evidence before it impacts billing.</p>
        </div>
      </div>
    </div>
  );

  // --- SUB-VIEW: THE LIVE QUEUE ---
  const QueueView = () => (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
      <button onClick={() => setView('landing')} className="text-blue-500 text-sm font-bold hover:underline">
        ← Back to Dashboard
      </button>

      {selectedWaybill ? (
        <DeliveryAction 
          waybillId={selectedWaybill.id} 
          waybillNumber={selectedWaybill.waybillNumber} 
          onSuccess={() => { setSelectedWaybill(null); fetchQueue(); }} 
        />
      ) : (
        <div className="max-w-2xl space-y-4">
          <h2 className="text-2xl font-bold text-white">Pending Deliveries</h2>
          {waybills.length === 0 ? (
             <div className="p-12 text-center border-2 border-dashed border-slate-800 rounded-2xl text-slate-600">No waybills ready for POD.</div>
          ) : (
            waybills.map(wb => (
              <div key={wb.id} onClick={() => setSelectedWaybill(wb)} className="bg-[#1e293b] border border-slate-800 p-4 rounded-xl flex justify-between items-center cursor-pointer hover:bg-blue-600/10 transition-colors">
                <div>
                  <p className="text-xs font-bold text-blue-500 uppercase">{wb.waybillNumber}</p>
                  <p className="text-white font-medium">{wb.recipient}</p>
                </div>
                <ChevronRight className="text-slate-600" />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="p-10 bg-[#0b1120] min-h-screen">
      {view === 'landing' ? <LandingView /> : <QueueView />}
    </div>
  );
};

export default PODDeliveries;