import { useState, useEffect, useCallback } from 'react';
import { FileSignature, Camera, CheckCircle2, AlertTriangle, Loader2, MapPin, Clock, Eye, Shield } from 'lucide-react';
import { listEpods, getEpodStats, verifyEpod, disputeEpod, type ElectronicPod as EPod, type EpodStats } from '../api/epodApi';
import { useToast } from '../hooks/useToast';

export default function ElectronicPod() {
  const { showToast } = useToast();
  const [pods, setPods] = useState<EPod[]>([]);
  const [stats, setStats] = useState<EpodStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<EPod | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (filter) params.status = filter;
      const [podsData, statsData] = await Promise.all([listEpods(params), getEpodStats()]);
      setPods(podsData);
      setStats(statsData);
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, showToast]);

  useEffect(() => { load(); }, [load]);

  const handleVerify = async (id: string) => {
    try { await verifyEpod(id); showToast('ePOD verified', 'success'); load(); setSelected(null); }
    catch (e: any) { showToast(e.message, 'error'); }
  };

  const handleDispute = async (id: string) => {
    const reason = prompt('Dispute reason:');
    if (!reason) return;
    try { await disputeEpod(id, reason); showToast('ePOD disputed', 'success'); load(); setSelected(null); }
    catch (e: any) { showToast(e.message, 'error'); }
  };

  const statusStyle = (s: string) => {
    switch (s) {
      case 'VERIFIED': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'CAPTURED': return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'DISPUTED': return 'bg-red-500/10 text-red-400 border-red-500/30';
      default: return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-indigo-500/30">
              <FileSignature className="w-6 h-6 text-indigo-400" />
            </div>
            Electronic Proof of Delivery
          </h1>
          <p className="text-sm text-white/50 mt-1">Signature capture, photo verification & dispute management</p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-white/50">Total</p><p className="text-xl font-black text-white mt-1">{stats.total}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-white/50">Captured</p><p className="text-xl font-black text-blue-400 mt-1">{stats.captured}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-white/50">Verified</p><p className="text-xl font-black text-emerald-400 mt-1">{stats.verified}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-white/50">Disputed</p><p className="text-xl font-black text-red-400 mt-1">{stats.disputed}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-white/50">Verification Rate</p><p className="text-xl font-black text-violet-400 mt-1">{stats.verificationRate}%</p></div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        {['', 'PENDING', 'CAPTURED', 'VERIFIED', 'DISPUTED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${filter === f ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40' : 'bg-white/5 text-white/50 border border-white/10 hover:border-white/20'}`}>
            {f || 'All'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List */}
        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-indigo-400 animate-spin" /></div>
          ) : pods.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center">
              <FileSignature className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <p className="text-white/50">No electronic PODs found.</p>
            </div>
          ) : (
            pods.map(pod => (
              <div key={pod.id} onClick={() => setSelected(pod)} className={`rounded-2xl border ${selected?.id === pod.id ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-white/10 bg-white/[0.03]'} p-4 cursor-pointer hover:border-white/20 transition`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                      {pod.signatureUrl ? <FileSignature className="w-5 h-5 text-indigo-400" /> : <Camera className="w-5 h-5 text-white/40" />}
                    </div>
                    <div>
                      <p className="text-white text-sm font-bold">WB: {pod.waybillId.slice(0, 12)}...</p>
                      <p className="text-xs text-white/40">{pod.recipientName || 'Unknown recipient'}</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${statusStyle(pod.status)}`}>{pod.status}</span>
                </div>
                <div className="flex gap-4 mt-3 text-xs text-white/40">
                  {pod.photoUrls?.length > 0 && <span className="flex items-center gap-1"><Camera className="w-3 h-3" />{pod.photoUrls.length} photos</span>}
                  {pod.geoLat && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{pod.geoLat.toFixed(4)}, {pod.geoLng?.toFixed(4)}</span>}
                  {pod.capturedAt && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(pod.capturedAt).toLocaleString()}</span>}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Detail Panel */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          {selected ? (
            <div className="space-y-4">
              <h3 className="text-white font-bold">ePOD Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-white/50">Status</span><span className={`font-bold ${statusStyle(selected.status).split(' ')[1]}`}>{selected.status}</span></div>
                <div className="flex justify-between"><span className="text-white/50">Waybill</span><span className="text-white font-mono text-xs">{selected.waybillId}</span></div>
                <div className="flex justify-between"><span className="text-white/50">Recipient</span><span className="text-white">{selected.recipientName || '—'}</span></div>
                <div className="flex justify-between"><span className="text-white/50">ID Number</span><span className="text-white">{selected.recipientId || '—'}</span></div>
                <div className="flex justify-between"><span className="text-white/50">Signature</span><span className={selected.signatureUrl ? 'text-emerald-400' : 'text-white/30'}>{selected.signatureUrl ? 'Captured' : 'None'}</span></div>
                <div className="flex justify-between"><span className="text-white/50">Photos</span><span className="text-white">{selected.photoUrls?.length || 0}</span></div>
                {selected.notes && <div className="pt-2 border-t border-white/10"><p className="text-xs text-white/50">Notes</p><p className="text-sm text-white/70 mt-1">{selected.notes}</p></div>}
                {selected.disputeReason && <div className="pt-2 border-t border-white/10"><p className="text-xs text-red-400">Dispute Reason</p><p className="text-sm text-white/70 mt-1">{selected.disputeReason}</p></div>}
              </div>
              {selected.status === 'CAPTURED' && (
                <div className="flex gap-2 pt-3 border-t border-white/10">
                  <button onClick={() => handleVerify(selected.id)} className="flex-1 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 flex items-center justify-center gap-1"><Shield className="w-3.5 h-3.5" />Verify</button>
                  <button onClick={() => handleDispute(selected.id)} className="flex-1 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs font-bold hover:bg-red-500/20 flex items-center justify-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Dispute</button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-white/30">
              <Eye className="w-10 h-10 mb-3" />
              <p className="text-sm">Select an ePOD to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
