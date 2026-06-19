import React, { useState, useEffect } from 'react';
import { 
  Users, Shield, Mail, Lock, Save, X, ChevronRight, 
  Eye, EyeOff, Settings, Activity, Search, Command, Filter
} from 'lucide-react';
import { api } from '../api/client';

export default function UsersRoles() {
  const [users, setUsers] = useState([]);
  const [flippedId, setFlippedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // 🚀 SYNC: Pull real-time personnel data
  const fetchUsers = async () => {
    try {
      const res: any = await api.get('/users/my-company');
      const list = Array.isArray(res) ? res : (res?.data ?? res ?? []);
      setUsers(list);
    } catch (err) { 
      console.error("AI Sync failed: Connection to FlowOps core lost.", err); 
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  // 🚀 PERMISSION ENGINE: Real-time patch to database
  const handleTogglePermission = async (userId: number, currentPermissions: any, key: string) => {
    const updatedPermissions = { ...currentPermissions, [key]: !currentPermissions[key] };
    try {
      await api.patch(`/users/${userId}`, { permissions: updatedPermissions });
      fetchUsers(); 
    } catch (err) { 
      console.error("Permission update failed on FlowOps ledger", err); 
    }
  };

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(55,90,180,0.12),transparent_45%),#07111f] p-8 font-sans selection:bg-blue-500/30">
      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* --- OMNISCIENT HEADER --- */}
        <header className="space-y-8">
          <div className="flex justify-between items-end">
            <div className="space-y-1">
              <h1 className="text-6xl font-black text-white tracking-tighter italic leading-none">
                COMMAND <span className="text-blue-600">CENTER</span>
              </h1>
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-slate-500 font-bold uppercase tracking-[0.3em] text-[10px]">
                  FlowOps AI: Unified Personnel & Deep Access Surface
                </p>
              </div>
            </div>
            <button className="bg-white text-black px-10 py-5 rounded-[24px] font-black text-sm transition-all hover:bg-blue-600 hover:text-white active:scale-95 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
              + INVITE AGENT
            </button>
          </div>

          {/* --- DEEP SEARCH BAR (Better than DHL/UPS) --- */}
          <div className="relative group">
            <div className="absolute inset-y-0 left-7 flex items-center pointer-events-none">
              <Search className="text-blue-500 group-focus-within:text-white transition-colors" size={24} />
            </div>
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Deep Search waybills, OCR manifests, or audit trails..."
              className="w-full bg-white/5 border border-white/10 rounded-[32px] pl-20 pr-40 py-8 text-xl text-white font-medium placeholder:text-slate-600 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:bg-white/10 transition-all backdrop-blur-2xl shadow-2xl"
            />
            <div className="absolute inset-y-0 right-8 flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10">
                <Command size={14} className="text-slate-400" />
                <span className="text-xs font-black text-slate-400">K</span>
              </div>
              <div className="h-8 w-[1px] bg-white/10" />
              <button className="p-3 hover:bg-white/10 rounded-full transition-colors text-slate-400">
                <Filter size={20} />
              </button>
            </div>
          </div>
        </header>

        {/* --- PERSONNEL GRID --- */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
          {users.map((user: any) => (
            <div key={user.id} className="group h-[360px] [perspective:2000px]">
              <div className={`relative w-full h-full transition-all duration-[1000ms] [transform-style:preserve-3d] ${flippedId === user.id ? '[transform:rotateX(180deg)]' : ''}`}>
                
                {/* --- FRONT: THE IDENTITY SURFACE --- */}
                <div className="absolute inset-0 backface-hidden bg-white/5 border border-white/10 rounded-[48px] p-10 backdrop-blur-3xl shadow-2xl flex flex-col justify-between hover:border-blue-500/30 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex gap-7">
                      <div className="h-20 w-20 rounded-[28px] bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white text-3xl font-black shadow-2xl ring-4 ring-blue-500/20">
                        {user.name?.charAt(0) || 'U'}
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-3xl font-black text-white tracking-tighter">{user.name || 'External User'}</h3>
                        <p className="text-blue-500 font-black text-xs uppercase tracking-widest">{user.role}</p>
                        <div className="flex items-center gap-2 text-slate-500 text-sm font-medium pt-2">
                          <Mail size={14} /> {user.email}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest border border-emerald-500/30 text-emerald-500 bg-emerald-500/5`}>
                        LIVE_FEED
                      </div>
                      <Activity size={18} className="text-emerald-500/50" />
                    </div>
                  </div>

                  <div className="bg-black/40 rounded-[24px] p-6 border border-white/5 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-3">
                        {['D', 'S', 'B', 'W'].map((l, i) => (
                          <div key={i} className="h-10 w-10 rounded-full border-4 border-[#07111f] bg-slate-800 flex items-center justify-center text-[10px] font-black text-white">
                            {l}
                          </div>
                        ))}
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter ml-2">Active Modules</span>
                    </div>
                    <button 
                      onClick={() => setFlippedId(user.id)}
                      className="bg-white/5 hover:bg-white text-white hover:text-black px-8 py-3.5 rounded-2xl text-xs font-black transition-all flex items-center gap-3 active:scale-95"
                    >
                      FLIP TO ACCESS <Settings size={16} />
                    </button>
                  </div>
                </div>

                {/* --- BACK: THE PERMISSION MATRIX (Flip-Page) --- */}
                <div className="absolute inset-0 backface-hidden [transform:rotateX(180deg)] bg-[#0b1530] border-2 border-blue-600/50 rounded-[48px] p-10 shadow-[0_0_80px_rgba(37,99,235,0.15)]">
                  <div className="flex justify-between items-center mb-8">
                    <div className="space-y-1">
                      <h4 className="text-white font-black text-2xl tracking-tighter italic">ACCESS MATRIX</h4>
                      <p className="text-blue-500 text-[10px] font-bold uppercase tracking-[0.2em]">FlowOps Security Protocol</p>
                    </div>
                    <button onClick={() => setFlippedId(null)} className="p-3 hover:bg-white/10 rounded-full text-slate-400 transition-colors">
                      <X size={24} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {['dashboard', 'shipments', 'billing', 'dispatch', 'OCR_inbox', 'analytics'].map((module) => (
                      <button 
                        key={module}
                        onClick={() => handleTogglePermission(user.id, user.permissions || {}, module)}
                        className={`p-5 rounded-[22px] border-2 transition-all flex items-center justify-between group/btn ${
                          user.permissions?.[module] 
                            ? 'bg-blue-600 border-blue-400 shadow-lg' 
                            : 'bg-black/40 border-white/5 opacity-40 hover:opacity-100 hover:border-white/20'
                        }`}
                      >
                        <span className={`text-[12px] font-black uppercase tracking-tighter ${user.permissions?.[module] ? 'text-white' : 'text-slate-500'}`}>
                          {module.replace('_', ' ')}
                        </span>
                        {user.permissions?.[module] ? <Eye size={18} className="text-white" /> : <EyeOff size={18} className="text-slate-700" />}
                      </button>
                    ))}
                  </div>

                  <div className="mt-10 flex gap-4">
                    <button className="flex-1 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-500/20 py-4 rounded-2xl text-[11px] font-black uppercase transition-all tracking-widest">
                      REVOKE ALL
                    </button>
                    <button onClick={() => setFlippedId(null)} className="flex-[2] bg-white text-black py-4 rounded-2xl text-[11px] font-black uppercase shadow-2xl transition-all hover:bg-blue-500 hover:text-white">
                      COMMIT WORKSPACE CHANGES
                    </button>
                  </div>
                </div>

              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
