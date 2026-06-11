import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Package, Map, PenTool, RefreshCcw, MessageSquare, Boxes, LogOut, Loader2 } from 'lucide-react';
import { useDriverAuth } from '../../contexts/DriverAuthContext';
import { useNavigate } from 'react-router-dom';

export default function DriverPortal() {
  const { driver, logout, isAuthenticated, isLoading: authLoading } = useDriverAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);

  const fetchManifest = async () => {
    if (!isAuthenticated) return;
    try {
      setSyncing(true);
      const res: any = await api.get('/waybills/driver/manifest');
      setJobs(Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []));
    } catch (err: any) {
      if (err.response?.status === 401) navigate('/driver/login');
    } finally { setSyncing(false); }
  };

  // Trigger fetch when auth is confirmed
  useEffect(() => { 
    if (!authLoading && !isAuthenticated) navigate('/driver/login');
    if (isAuthenticated) fetchManifest(); 
  }, [isAuthenticated, authLoading]);

  if (authLoading) return (
    <div className="min-h-screen bg-[#020817] flex flex-col items-center justify-center gap-4">
      <Loader2 className="animate-spin text-sky-500" size={40} />
      <p className="text-sky-500 font-black italic uppercase tracking-widest text-xs">Authenticating...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#020817] text-white p-6 font-sans text-left relative">
      <header className="flex justify-between items-center mb-8 pt-4">
        <div>
          <h1 className="text-2xl font-black italic tracking-tighter uppercase leading-none">Route</h1>
          <p className="text-sky-500 text-[10px] font-black uppercase mt-1">{driver?.name || 'Unit Active'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchManifest} className="p-3 bg-white/5 rounded-2xl text-sky-500">
            <RefreshCcw size={20} className={syncing ? "animate-spin" : ""} />
          </button>
          <button onClick={logout} className="p-3 bg-white/5 rounded-2xl text-slate-500"><LogOut size={20}/></button>
        </div>
      </header>

      <div className="flex bg-slate-900/50 p-1 rounded-2xl border border-white/5 mb-6">
        <button className="flex-1 py-3 rounded-xl font-black text-[10px] uppercase bg-sky-500 text-white shadow-lg">
          Deliveries ({jobs.length})
        </button>
        <button className="flex-1 py-3 text-slate-600 font-black text-[10px] uppercase">Collections (0)</button>
      </div>

      <div className="space-y-4 pb-20">
        {jobs.length === 0 && !syncing ? (
           <div className="p-20 text-center opacity-20 border-2 border-dashed border-white/10 rounded-[40px]">
             <Boxes size={48} className="mx-auto mb-4" />
             <p className="text-xs font-black uppercase">Manifest Clear</p>
           </div>
        ) : (
          jobs.map(job => (
            <div key={job.id} className="bg-slate-900/40 border border-white/5 p-6 rounded-[36px] shadow-2xl space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 bg-sky-500/10 rounded-xl flex items-center justify-center text-sky-400"><Package size={20} /></div>
                  <div className="text-left flex-1 overflow-hidden">
                    <h4 className="font-black text-white leading-none mb-1">{job.waybillNumber}</h4>
                    <p className="text-[10px] font-black text-slate-500 uppercase truncate max-w-[150px]">{job.recipient}</p>
                  </div>
                </div>
                {job.recipientPhone && (
                  <button onClick={() => window.open(`https://wa.me/${job.recipientPhone.replace(/\D/g,'')}`, '_blank')} className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl border border-emerald-500/10">
                    <MessageSquare size={18} />
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.deliveryAddress || '')}`, '_blank')} className="flex-1 bg-white/5 py-4 rounded-2xl border border-white/5 text-[10px] font-black uppercase text-slate-400 flex items-center justify-center gap-2">
                  <Map size={14}/> Map
                </button>
                <button onClick={() => navigate(`/driver/manifest/${job.id}`)} className="flex-1 bg-sky-600 py-4 rounded-2xl text-[10px] font-black uppercase text-white shadow-lg flex items-center justify-center gap-2">
                  <PenTool size={14}/> POD
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
