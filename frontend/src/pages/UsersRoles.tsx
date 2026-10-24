import React, { useState, useEffect } from 'react';
import { Mail, X,
  Eye, EyeOff, Settings, Activity, Search, Command, Filter
} from 'lucide-react';
import { api } from '../api/client';
import {
  ALL_TENANT_NAV_PERMISSION_KEYS,
  TENANT_NAV_PERMISSION_LABELS,
  normalizeTenantNavPermissions,
  buildRoleDefaultTenantNavPermissions,
} from '../lib/tenantUserPermissions';


type CompanyUser = {
  id: string | number;
  name?: string;
  email?: string;
  role?: string;
  permissions?: string[] | Record<string, boolean>;
};
type DriverPinRow = {
  id: string;
  name: string;
  phone?: string;
  vehicleReg?: string;
  hasPinSet: boolean;
};

export default function UsersRoles() {
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [flippedId, setFlippedId] = useState<string | number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [cEmail, setCEmail] = useState('');
  const [cPassword, setCPassword] = useState('');
  const [cRole, setCRole] = useState('DISPATCH');
  const [cName, setCName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState('');
  const [drivers, setDrivers] = useState<DriverPinRow[]>([]);
  const [pinInputs, setPinInputs] = useState<Record<string,string>>({});
  const [pinSaving, setPinSaving] = useState<string|null>(null);
  const [pinMsg, setPinMsg] = useState('');

  // 🚀 SYNC: Pull real-time personnel data
  const fetchUsers = () => (async () => {
    const res = await api.get('/users/my-company');
    const list = Array.isArray(res) ? res : (res?.data ?? res ?? []);
    setUsers(list);

  })().catch((err) => {

    console.error("AI Sync failed: Connection to FlowOps core lost.", err);

  });

  const loadDrivers = () => (async () => {
    try {
      const res = await api.get('/drivers');
      const list = Array.isArray(res) ? res : (res?.data ?? []);
      setDrivers((list as { id: string | number; name?: string; phone?: string; vehicleReg?: string; driverPin?: string | null }[]).map((d) => ({ id: String(d.id), name: d.name||'Driver', phone: d.phone, vehicleReg: d.vehicleReg, hasPinSet: !!d.driverPin })));
    } catch (e) { console.error('driver list failed to load', e); }
  })();

  useEffect(() => { fetchUsers(); loadDrivers(); }, []);

  const handleSetPin = async (id: string) => {
    const pin = (pinInputs[id]||'').trim();
    if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) { setPinMsg('PIN must be 4-6 digits'); return; }
    setPinSaving(id); setPinMsg('');
    try { await api.patch(`/drivers/${id}/pin`, { pin }); setPinMsg('PIN set!'); setPinInputs(p=>({...p,[id]:''})); loadDrivers(); }
    catch { setPinMsg('Failed to set PIN'); }
    finally { setPinSaving(null); }
  };

  const handleClearPin = async (id: string) => {
    setPinSaving(id); setPinMsg('');
    try { await api.patch(`/drivers/${id}/reset-pin`, {}); setPinMsg('PIN cleared.'); loadDrivers(); }
    catch { setPinMsg('Failed to clear PIN'); }
    finally { setPinSaving(null); }
  };

  const createUser = async () => {
    if (!cEmail || !cPassword) { setCreateMsg('Email and password required'); return; }
    setCreating(true); setCreateMsg('');
    try {
      await api.post('/users', { email: cEmail.trim(), name: cName || cEmail.split('@')[0], password: cPassword, role: cRole });
      setCreateMsg('User created successfully!');
      setCEmail(''); setCPassword(''); setCName('');
      setTimeout(() => { setShowCreate(false); setCreateMsg(''); fetchUsers(); }, 1200);
    } catch (e) {
      setCreateMsg(e?.response?.data?.message || 'Failed to create user');
    } finally { setCreating(false); }
  };

  // 🚀 PERMISSION ENGINE: writes the FULL canonical nav-permission set so the
  // toggles here actually drive the sidebar + route guards (RequirePermission /
  // AppLayout both read these exact keys from tenantUserPermissions).
  const handleTogglePermission = async (user: CompanyUser, key: string) => {
    const current = normalizeTenantNavPermissions(user.permissions, user.role);
    const updatedPermissions = { ...current, [key]: !current[key] };
    try {
      await api.patch(`/users/${user.id}`, { permissions: updatedPermissions });
      fetchUsers();
    } catch (err) {
      console.error("Permission update failed on FlowOps ledger", err);
    }
  };

  // Bulk: revoke everything except the dashboard (so the user can still log in).
  const handleRevokeAll = async (user: CompanyUser) => {
    const cleared = Object.fromEntries(
      ALL_TENANT_NAV_PERMISSION_KEYS.map((k) => [k, k === "dashboard"]),
    );
    try {
      await api.patch(`/users/${user.id}`, { permissions: cleared });
      fetchUsers();
    } catch (err) {
      console.error("Revoke-all failed", err);
    }
  };

  // Bulk: reset to the sensible defaults for the user's role / department.
  const handleResetToRole = async (user: CompanyUser) => {
    try {
      await api.patch(`/users/${user.id}`, {
        permissions: buildRoleDefaultTenantNavPermissions(user.role),
      });
      fetchUsers();
    } catch (err) {
      console.error("Reset-to-role failed", err);
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
            <button onClick={() => setShowCreate(true)} className="bg-white text-black px-10 py-5 rounded-[24px] font-black text-sm transition-all hover:bg-blue-600 hover:text-white active:scale-95 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
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
          {users.map((user) => (
            <div key={user.id} className="group h-[360px] [perspective:2000px]">
              <div className={`relative w-full h-full transition-all duration-[1000ms] [transform-style:preserve-3d] ${flippedId === user.id ? '[transform:rotateX(180deg)]' : ''}`}>

                {/* --- FRONT: THE IDENTITY SURFACE --- */}
                <div className={`absolute inset-0 backface-hidden bg-white/5 border border-white/10 rounded-[48px] p-10 backdrop-blur-3xl shadow-2xl flex flex-col justify-between hover:border-blue-500/30 transition-colors${flippedId === user.id ? " pointer-events-none" : ""}` }>
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
                <div className="absolute inset-0 backface-hidden [transform:rotateX(180deg)] bg-[#0b1530] border-2 border-blue-600/50 rounded-[48px] p-6 shadow-[0_0_80px_rgba(37,99,235,0.15)]">
                  <div className="flex justify-between items-center mb-4">
                    <div className="space-y-1">
                      <h4 className="text-white font-black text-2xl tracking-tighter italic">ACCESS MATRIX</h4>
                      <p className="text-blue-500 text-[10px] font-bold uppercase tracking-[0.2em]">Sidebar &amp; page visibility · {user.role}</p>
                    </div>
                    <button onClick={() => setFlippedId(null)} className="p-3 hover:bg-white/10 rounded-full text-slate-400 transition-colors">
                      <X size={24} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                    {ALL_TENANT_NAV_PERMISSION_KEYS.map((key) => {
                      const on = normalizeTenantNavPermissions(user.permissions, user.role)[key];
                      return (
                        <button
                          key={key}
                          onClick={() => handleTogglePermission(user, key)}
                          title={TENANT_NAV_PERMISSION_LABELS[key]}
                          className={`p-3 rounded-2xl border-2 transition-all flex items-center justify-between gap-2 group/btn ${
                            on
                              ? 'bg-blue-600 border-blue-400 shadow-lg'
                              : 'bg-black/40 border-white/5 opacity-50 hover:opacity-100 hover:border-white/20'
                          }`}
                        >
                          <span className={`truncate text-left text-[11px] font-black uppercase tracking-tight ${on ? 'text-white' : 'text-slate-500'}`}>
                            {TENANT_NAV_PERMISSION_LABELS[key]}
                          </span>
                          {on ? <Eye size={15} className="shrink-0 text-white" /> : <EyeOff size={15} className="shrink-0 text-slate-700" />}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-5 flex gap-3">
                    <button
                      onClick={() => handleRevokeAll(user)}
                      className="flex-1 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-500/20 py-3.5 rounded-2xl text-[11px] font-black uppercase transition-all tracking-widest"
                    >
                      REVOKE ALL
                    </button>
                    <button
                      onClick={() => handleResetToRole(user)}
                      className="flex-1 bg-amber-500/10 hover:bg-amber-500 text-amber-400 hover:text-black border border-amber-500/20 py-3.5 rounded-2xl text-[11px] font-black uppercase transition-all tracking-widest"
                    >
                      RESET TO {String(user.role || 'ROLE').toUpperCase()}
                    </button>
                    <button onClick={() => setFlippedId(null)} className="flex-[1.6] bg-white text-black py-3.5 rounded-2xl text-[11px] font-black uppercase shadow-2xl transition-all hover:bg-blue-500 hover:text-white">
                      DONE
                    </button>
                  </div>
                </div>

              </div>
            </div>
          ))}
        </div>
      </div>

      {showCreate && (
        <div style={{position:'fixed',inset:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.8)'}}>
          <div style={{width:'100%',maxWidth:420,borderRadius:28,border:'1px solid rgba(255,255,255,0.1)',background:'#0b1530',padding:32}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
              <h2 style={{color:'white',fontWeight:900,fontSize:22,margin:0}}>Invite Agent</h2>
              <button onClick={()=>{setShowCreate(false);setCreateMsg('');}} style={{background:'none',border:'none',color:'#64748b',cursor:'pointer',fontSize:20}}>&#x2715;</button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div><div style={{color:'#94a3b8',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:2,marginBottom:4}}>Name</div>
                <input value={cName} onChange={e=>setCName(e.target.value)} placeholder='Display name' style={{width:'100%',borderRadius:14,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(0,0,0,0.4)',padding:'12px 14px',color:'white',fontSize:14,outline:'none',boxSizing:'border-box'}} /></div>
              <div><div style={{color:'#94a3b8',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:2,marginBottom:4}}>Email *</div>
                <input type='email' value={cEmail} onChange={e=>setCEmail(e.target.value)} placeholder='agent@company.com' style={{width:'100%',borderRadius:14,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(0,0,0,0.4)',padding:'12px 14px',color:'white',fontSize:14,outline:'none',boxSizing:'border-box'}} /></div>
              <div><div style={{color:'#94a3b8',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:2,marginBottom:4}}>Password *</div>
                <input type='password' value={cPassword} onChange={e=>setCPassword(e.target.value)} placeholder='Min 6 characters' style={{width:'100%',borderRadius:14,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(0,0,0,0.4)',padding:'12px 14px',color:'white',fontSize:14,outline:'none',boxSizing:'border-box'}} /></div>
              <div><div style={{color:'#94a3b8',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:2,marginBottom:4}}>Role</div>
                <select value={cRole} onChange={e=>setCRole(e.target.value)} style={{width:'100%',borderRadius:14,border:'1px solid rgba(255,255,255,0.1)',background:'#0b1530',padding:'12px 14px',color:'white',fontSize:14,outline:'none'}}>
                  <option value='DISPATCH'>Dispatch Controller</option>
                  <option value='WAREHOUSE'>Warehouse Clerk</option>
                  <option value='DRIVER'>Field Driver</option>
                  <option value='MANAGER'>Ops Manager</option>
                  <option value='AGENT'>Sales Agent</option>
                  <option value='VIEWER'>Finance Viewer</option>
                  <option value='ADMIN'>Administrator</option>
                  <option value='COMPANY_ADMIN'>Company Admin</option>
                </select></div>
              {createMsg && <div style={{padding:'10px 14px',borderRadius:14,background:createMsg.includes('!')||createMsg.includes('success')?'rgba(16,185,129,0.15)':'rgba(239,68,68,0.15)',color:createMsg.includes('!')||createMsg.includes('success')?'#6ee7b7':'#fca5a5',fontSize:13,fontWeight:700}}>{createMsg}</div>}
              <button onClick={createUser} disabled={creating} style={{marginTop:8,width:'100%',borderRadius:14,background:'#2563eb',padding:'14px',color:'white',fontWeight:900,fontSize:13,border:'none',cursor:creating?'not-allowed':'pointer',opacity:creating?0.6:1}}>
                {creating ? 'Deploying...' : 'Deploy Agent'}
              </button>
            </div>
          </div>
        </div>
      )}

        {/* DRIVER PINs */}
        <div style={{marginTop:48}}>
          <div style={{marginBottom:24}}>
            <h2 style={{color:'white',fontWeight:900,fontSize:28,margin:0,letterSpacing:'-1px'}}>DRIVER <span style={{color:'#2563eb'}}>PINs</span></h2>
            <p style={{color:'#475569',fontSize:12,marginTop:6,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.2em'}}>Portal access codes for field drivers</p>
          </div>
          {pinMsg && <div style={{marginBottom:16,padding:'10px 16px',borderRadius:16,background:pinMsg.includes('set')||pinMsg.includes('clear')||pinMsg.includes('!')? 'rgba(16,185,129,0.15)':'rgba(239,68,68,0.15)',color:pinMsg.includes('set')||pinMsg.includes('clear')||pinMsg.includes('!')?'#6ee7b7':'#fca5a5',fontSize:13,fontWeight:700}}>{pinMsg}</div>}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:16}}>
            {drivers.length===0 && <div style={{color:'#475569',fontSize:14}}>No drivers yet. Add drivers in Driver Dispatch first.</div>}
            {drivers.map((d) => (
              <div key={d.id} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:24,padding:20,display:'flex',flexWrap:'wrap',alignItems:'center',gap:12}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:'white',fontWeight:900,fontSize:15}}>{d.name}</div>
                  <div style={{color:'#64748b',fontSize:12,marginTop:2}}>{d.phone||'—'}{d.vehicleReg?` · ${d.vehicleReg}`:''}</div>
                </div>
                <span style={{padding:'4px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:d.hasPinSet?'rgba(16,185,129,0.15)':'rgba(245,158,11,0.15)',color:d.hasPinSet?'#6ee7b7':'#fbbf24',border:`1px solid ${d.hasPinSet?'rgba(16,185,129,0.3)':'rgba(245,158,11,0.3)'}`}}>{d.hasPinSet?'PIN SET':'NO PIN'}</span>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <input type='number' value={pinInputs[d.id]||''} onChange={e=>setPinInputs(p=>({...p,[d.id]:e.target.value}))} placeholder='4-6 digit PIN' style={{width:100,borderRadius:12,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(0,0,0,0.4)',padding:'8px 12px',color:'white',fontSize:13,outline:'none'}} />
                  <button onClick={()=>handleSetPin(d.id)} disabled={pinSaving===d.id} style={{borderRadius:12,background:'rgba(37,99,235,0.2)',border:'1px solid rgba(37,99,235,0.3)',padding:'8px 14px',color:'#93c5fd',fontSize:12,fontWeight:700,cursor:'pointer'}}>Set</button>
                  {d.hasPinSet && <button onClick={()=>handleClearPin(d.id)} disabled={pinSaving===d.id} style={{borderRadius:12,background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.2)',padding:'8px 14px',color:'#fca5a5',fontSize:12,fontWeight:700,cursor:'pointer'}}>Clear</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
    </div>
  );
}
