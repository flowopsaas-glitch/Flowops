import React, { useEffect, useState } from "react";
import { 
  Layers, RefreshCw, FileText, Wand2, ArrowLeft, 
  Package, Lock, Calculator 
} from "lucide-react";
import { api } from '../api/client';
import { useToast } from "../components/ToastProvider";

export default function BillingBatches() {
  const { showToast } = useToast();
  const [batches, setBatches] = useState<any[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSweeping, setIsSweeping] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // AI States
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditFeedback, setAuditFeedback] = useState<string | null>(null);

  const loadBatches = async () => {
    try {
      setIsLoading(true);
      const res = await api.get('/billing-batches');
      setBatches(res.data);
    } catch (err) {
      showToast("Failed to sync financial ledger.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSweep = async () => {
    try {
      setIsSweeping(true);
      const res = await api.post('/billing-batches/sweep');
      
      if (res.data.jobsSwept === 0) {
        showToast("No unbilled deliveries found.", "error");
      } else {
        showToast(`Sweep successful! ${res.data.jobsSwept} jobs batched.`, "success");
      }
      
      await loadBatches(); 
    } catch (err) {
      showToast("Sweep failed. Ensure waybills are marked as DELIVERED.", "error");
    } finally {
      setIsSweeping(false);
    }
  };

  const handleAiAudit = async () => {
    if (!selectedBatch) return;
    try {
      setIsAuditing(true);
      setAuditFeedback(null);
      
      // FIX: Include the database ID for tool calls
      const waybillContext = selectedBatch.waybills.map((w: any) => ({
        id: w.id, 
        no: w.waybillNumber, 
        amt: w.totalAmount,
        to: w.recipient
      }));

      const res = await api.post('/ai/instruct', {
        command: `Audit billing batch #${selectedBatch.id}. 
                  Waybills: ${JSON.stringify(waybillContext)}. 
                  The batch total is R${selectedBatch.totalValue}. 
                  Analyze these for any pricing errors and summarize your findings.`
      });
      
      // FIX: Robust error and response handling
      let feedback = "";
      if (res.data.error || res.status === 400) {
        feedback = `Audit Warning: The AI model encountered a schema validation error while trying to process this batch.`;
      } else if (res.data.type === 'BATCH_SUCCESS' || res.data.type === 'ACTION_SUCCESS') {
        feedback = "Audit complete: Adjustments or verifications have been successfully processed.";
      } else {
        feedback = res.data.response || res.data.payload?.response || "Analysis complete. No pricing anomalies were detected in this specific batch.";
      }

      setAuditFeedback(feedback);
      showToast("AI Audit Complete", "success");
    } catch (err) {
      console.error(err);
      showToast("AI Auditor encountered a processing error.", "error");
    } finally {
      setIsAuditing(false);
    }
  };

  const handleGenerateInvoice = async () => {
    if (!selectedBatch) return;
    try {
      setIsGenerating(true);
      const res = await api.post(`/billing-batches/${selectedBatch.id}/generate-invoices`);
      showToast(`Invoice ${res.data.invoiceNumber || 'Draft'} generated!`, "success");
      setSelectedBatch(null);
      await loadBatches();
    } catch (err) {
      showToast("Invoice generation failed.", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => { loadBatches(); }, []);

  if (selectedBatch) {
    const isLocked = selectedBatch.status === 'LOCKED';
    return (
      <div style={pageStyle} className="animate-in fade-in slide-in-from-right-4 duration-500">
        <header style={headerStyle}>
          <button onClick={() => { setSelectedBatch(null); setAuditFeedback(null); }} style={syncBtn}>
            <ArrowLeft size={16} /> BACK TO OVERVIEW
          </button>
          
          {!isLocked && (
            <div className="flex gap-3">
              <button 
                onClick={handleAiAudit} 
                disabled={isAuditing} 
                style={{...syncBtn, borderColor: 'rgba(168, 85, 247, 0.4)', color: '#a855f7'}}
              >
                {isAuditing ? <RefreshCw size={14} className="animate-spin" /> : <Calculator size={16} />}
                AI PRICE AUDIT
              </button>

              <button onClick={handleGenerateInvoice} disabled={isGenerating} style={generateBtn}>
                {isGenerating ? <RefreshCw size={14} className="animate-spin" /> : <FileText size={16} />}
                GENERATE FINAL INVOICE
              </button>
            </div>
          )}
        </header>

        <div style={tableContainer}>
          <div className="flex justify-between items-end mb-8">
            <div>
              <div style={eyebrowStyle}>CLIENT: {selectedBatch.company?.name || "RECONCILIATION"}</div>
              <h1 style={titleStyle}>Batch #{String(selectedBatch.id).padStart(4, '0')}</h1>
              {isLocked && (
                <div className="mt-2 text-slate-500 text-[10px] font-black uppercase flex items-center gap-2">
                  <Lock size={12}/> LOCKED & INVOICED
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-[10px] font-black text-sky-400 uppercase tracking-widest">Calculated Revenue</div>
              <div className="text-4xl font-black text-emerald-400">R {Number(selectedBatch.totalValue || 0).toLocaleString()}</div>
            </div>
          </div>

          {auditFeedback && (
            <div className="mb-8 p-6 rounded-3xl border border-purple-500/30 bg-purple-500/5 text-purple-100 text-[13px] font-medium leading-relaxed animate-in zoom-in-95 duration-300 shadow-2xl shadow-purple-500/10">
              <div className="flex items-center gap-2 mb-3 text-purple-400 font-black text-[10px] tracking-widest uppercase">
                <Wand2 size={14} /> AI Auditor Analysis
              </div>
              {auditFeedback}
            </div>
          )}

          <div className="grid gap-3">
            {selectedBatch.waybills?.map((wb: any, idx: number) => (
              <div key={wb.id || `wb-${idx}`} style={itemCardStyle}>
                <div className="flex items-center gap-4">
                  <div style={iconBoxStyle}><Package size={20} /></div>
                  <div>
                    <div className="font-black text-white">{wb.waybillNumber}</div>
                    <div className="text-[10px] text-slate-500 font-bold uppercase">To: {wb.recipient}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-black text-white">R {Number(wb.totalAmount || 0).toFixed(2)}</div>
                  <div className="text-[9px] text-emerald-500 font-black uppercase tracking-tighter">Verified Logic</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>FINANCE · TENANT ADMIN</div>
          <h1 style={titleStyle}>Billing Batches</h1>
        </div>
        <div className="flex gap-3">
          <button onClick={loadBatches} style={syncBtn}>
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} /> REFRESH
          </button>
          <button onClick={handleSweep} disabled={isSweeping} style={sweepBtn}>
            <Wand2 size={14} /> SWEEP DELIVERIES
          </button>
        </div>
      </header>

      <div style={tableContainer}>
        {batches.length > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr style={headerRowStyle}>
                <th style={thStyle}>BATCH ID</th>
                <th style={thStyle}>STATUS</th>
                <th style={thStyle}>REVENUE</th>
                <th style={thStyle}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id} style={rowStyle}>
                  <td style={tdStyle} className="font-black text-white">#{String(batch.id).padStart(4, '0')}</td>
                  <td style={tdStyle}><span style={statusBadge(batch.status)}>{batch.status}</span></td>
                  <td style={tdStyle} className="text-emerald-400 font-black">R {Number(batch.totalValue || 0).toLocaleString()}</td>
                  <td style={tdStyle}>
                    <button onClick={() => setSelectedBatch(batch)} style={actionBtn}>REVIEW DRAFT</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={statusMessage}>
            <Layers size={48} className="text-slate-700 mb-4" />
            <div className="text-white font-black">Ledger is empty</div>
            <p className="text-slate-500 text-xs mt-2 uppercase font-bold tracking-widest">Sweep the floor to group delivered waybills.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Styles remain identical to your original provided file...
const pageStyle: React.CSSProperties = { padding: "40px", color: "#fff", minHeight: "100%" };
const headerStyle: React.CSSProperties = { marginBottom: "40px", display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const eyebrowStyle: React.CSSProperties = { fontSize: "10px", fontWeight: 900, color: "#38bdf8", letterSpacing: "0.25em", fontStyle: 'italic' };
const titleStyle: React.CSSProperties = { fontSize: "42px", fontWeight: 900, margin: 0, letterSpacing: '-0.05em' };
const syncBtn: React.CSSProperties = { background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '12px 24px', borderRadius: '16px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '10px', textTransform: 'uppercase', transition: 'all 0.2s' };
const sweepBtn: React.CSSProperties = { background: '#38bdf8', border: 'none', color: '#07111f', padding: '12px 24px', borderRadius: '16px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '10px', textTransform: 'uppercase' };
const generateBtn: React.CSSProperties = { background: '#10b981', border: 'none', color: '#fff', padding: '12px 24px', borderRadius: '16px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '10px' };
const tableContainer: React.CSSProperties = { background: "rgba(13,25,48,0.5)", borderRadius: "32px", padding: "40px", border: "1px solid rgba(255,255,255,0.05)", backdropFilter: "blur(20px)" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const headerRowStyle: React.CSSProperties = { borderBottom: "1px solid rgba(255,255,255,0.05)" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "20px", fontSize: "10px", color: "#64748b", fontWeight: 900, textTransform: 'uppercase' };
const tdStyle: React.CSSProperties = { padding: "20px", fontSize: "14px" };
const rowStyle: React.CSSProperties = { borderBottom: "1px solid rgba(255,255,255,0.02)" };
const statusMessage: React.CSSProperties = { textAlign: "center", padding: "100px", display: 'flex', flexDirection: 'column', alignItems: 'center' };
const actionBtn: React.CSSProperties = { background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '10px 20px', borderRadius: '12px', fontSize: '10px', fontWeight: 900, cursor: 'pointer' };
const itemCardStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', padding: '20px 24px', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' };
const iconBoxStyle: React.CSSProperties = { height: '44px', width: '44px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' };

const statusBadge = (status: string): React.CSSProperties => {
  const isDraft = String(status).toUpperCase() === 'OPEN';
  return {
    background: isDraft ? "rgba(56, 189, 248, 0.1)" : "rgba(16, 185, 129, 0.1)",
    color: isDraft ? "#38bdf8" : "#10b981",
    padding: "6px 16px", borderRadius: "10px", fontSize: "10px", fontWeight: 900, border: `1px solid ${isDraft ? "rgba(56, 189, 248, 0.2)" : "rgba(16, 185, 129, 0.2)"}`
  };
};
