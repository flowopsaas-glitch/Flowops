import React, { useState, useEffect } from 'react';
import { 
  Building2, SaveAll, ShieldCheck, Palette, Key, 
  CreditCard, Loader2, AlertCircle, Cpu, 
  Settings2, LayoutGrid, UploadCloud, Link2, ToggleLeft, ToggleRight
} from "lucide-react";
import { api } from '../../api/client';
import { useToast } from "../../components/ToastProvider";
import BranchHardware from './components/BranchHardware';

type SettingsView = 'PROFILE' | 'HARDWARE' | 'FEATURES';

/** Resolve the tenant's display currency from settings, falling back to the
 *  registered country (ZA -> ZAR) and finally a neutral default. */
function resolveCurrency(settings: any): string {
  if (settings?.currency) return String(settings.currency);
  const country = String(settings?.country || '').toUpperCase();
  if (country === 'ZA') return 'ZAR';
  return 'ZAR';
}

function formatMoney(value: unknown, currency: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  try {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString()}`;
  }
}

export default function TenantSettings() {
  const [view, setView] = useState<SettingsView>('PROFILE');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const { showToast } = useToast();

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.get('/v2/companies/settings');
      setSettings(res.data);
    } catch (err) {
      setErrorMessage("System Link Failure: Unable to retrieve enterprise state.");
    } finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setErrorMessage(null);

    const payload = {
      ...settings,
      twilioSid: settings.twilioSid?.includes('...') ? undefined : settings.twilioSid,
      sendGridKey: settings.sendGridKey?.includes('...') ? undefined : settings.sendGridKey,
    };

    try {
      await api.patch('/v2/companies/settings', payload);
      showToast("Enterprise Command Surface Synced.", "success");
    } catch (err: any) {
      const detail = err.response?.data?.message || "Sync Rejected by Server.";
      setErrorMessage(Array.isArray(detail) ? detail.join(", ") : detail);
    } finally { setSaving(false); }
  };

  if (loading || !settings) return (
    <div className="flex flex-col items-center justify-center p-20 animate-pulse text-cyan-500 font-black tracking-widest font-mono">
      <Loader2 className="h-10 w-10 animate-spin mb-4" />
      INITIALIZING COMMAND SURFACE...
    </div>
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 font-mono text-xs">
      {/* 🚀 Navigation Flip Header */}
      <div className="flex items-center justify-between bg-white/5 border border-white/10 p-2 rounded-2xl backdrop-blur-md sticky top-0 z-50">
        <div className="flex gap-2">
          <NavButton active={view === 'PROFILE'} onClick={() => setView('PROFILE')} icon={<Building2 size={14}/>} label="Global Profile" />
          <NavButton active={view === 'HARDWARE'} onClick={() => setView('HARDWARE')} icon={<Cpu size={14}/>} label="Branch Hardware" />
          <NavButton active={view === 'FEATURES'} onClick={() => setView('FEATURES')} icon={<LayoutGrid size={14}/>} label="Feature Control" />
        </div>
        <div className="px-4 text-[10px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-cyan-500 animate-pulse" />
          Live Instance
        </div>
      </div>

      {errorMessage && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 🔄 View Container */}
      <div className="relative min-h-[500px]">
        {view === 'PROFILE' && (
          <div className="animate-in slide-in-from-left-4 fade-in duration-300 space-y-6">
             <div className="grid gap-4 md:grid-cols-3">
                <BillingCard settings={settings} />
                <StatusCard settings={settings} />
             </div>
             <div className="grid gap-6 lg:grid-cols-2">
                <BrandingSection settings={settings} setSettings={setSettings} onUpload={loadSettings} isUploading={isUploading} setIsUploading={setIsUploading} showToast={showToast} />
                <InfrastructureSection settings={settings} setSettings={setSettings} />
             </div>
          </div>
        )}

        {view === 'HARDWARE' && <BranchHardware />}

        {view === 'FEATURES' && (
          <div className="animate-in zoom-in-95 fade-in duration-300">
            <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-10 text-center space-y-4">
               <div className="mx-auto w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400">
                  <Settings2 size={32} />
               </div>
               <h3 className="text-xl font-black text-white uppercase tracking-wider">Modular Capabilities</h3>
               <p className="text-white/50 text-sm max-w-md mx-auto leading-relaxed">Toggle operational AI and background systems optimization routes.</p>
               <div className="max-w-md mx-auto pt-6 space-y-3">
                  <FeatureToggle label="AI Waybill Extraction" enabled={true} />
                  <FeatureToggle label="Automated Debt Collection" enabled={false} />
                  <FeatureToggle label="Custom Client Portals" enabled={true} />
               </div>
            </div>
          </div>
        )}
      </div>

      {/* 💾 Global Deploy Button */}
      <button 
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 py-5 rounded-[24px] font-black text-sm text-white uppercase tracking-[0.3em] flex items-center justify-center gap-3 transition-all shadow-2xl shadow-blue-500/10 mt-10"
      >
        {saving ? <Loader2 size={18} className="animate-spin" /> : <SaveAll size={18} />}
        {saving ? "Deploying Infrastructure..." : "Sync Enterprise Command Surface"}
      </button>
    </div>
  );
}

/** 🧱 UI SUB-COMPONENTS */

function NavButton({ active, onClick, icon, label }: any) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${active ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
      {icon} {label}
    </button>
  );
}

function BillingCard({ settings }: any) {
  const currency = resolveCurrency(settings);
  // Real subscription figures come from the loaded company settings. When the
  // backend hasn't supplied a price we show a neutral placeholder rather than
  // fabricating a monthly amount.
  const seats = settings.userCount ?? settings.seats;
  const monthly =
    typeof settings.monthlyPrice === 'number' ? settings.monthlyPrice : undefined;
  const plan = settings.plan || settings.subscriptionPlan || 'Standard';

  return (
    <div className="md:col-span-2 rounded-[32px] border border-blue-500/20 bg-blue-500/5 p-6 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-blue-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4">
        <CreditCard size={14} /> Subscription
      </div>
      <div className="flex justify-between items-end">
        <div>
          <div className="text-4xl font-black text-white">{formatMoney(monthly, currency)}</div>
          <div className="text-sm text-white/50 mt-1 font-bold">
            {monthly === undefined ? 'Monthly price set by billing' : 'Monthly subscription'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-white capitalize">{plan}</div>
          <div className="text-[10px] text-white/40 uppercase font-black">
            {typeof seats === 'number' ? `${seats} Active Seat${seats === 1 ? '' : 's'}` : 'Active Plan'}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ settings }: any) {
  // Drive the SLA card from the tenant's real configured breach threshold
  // (Company.slaBreachMinutes) instead of a fabricated uptime percentage.
  const breach = settings?.slaBreachMinutes;
  const hasBreach = typeof breach === 'number' && Number.isFinite(breach);
  return (
    <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 flex flex-col justify-between">
      <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em]">
        <ShieldCheck size={14} /> Delivery SLA
      </div>
      <div>
        <div className="text-2xl font-black text-white">
          {hasBreach ? `${breach} min` : '—'}
        </div>
        <div className="text-[10px] text-white/40 uppercase font-bold tracking-tighter">
          {hasBreach ? 'Breach Threshold' : 'Not Configured'}
        </div>
      </div>
    </div>
  );
}

function BrandingSection({ settings, setSettings, onUpload, isUploading, setIsUploading, showToast }: any) {
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      await api.post('/api/v2/companies/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      showToast("Corporate emblem updated successfully.", "success");
      onUpload();
    } catch (err) {
      showToast("Logo transfer protocol failed.", "error");
    } finally { setIsUploading(false); }
  };

  return (
    <div className="rounded-[24px] border border-white/10 bg-black/20 p-6 space-y-4">
      <div className="flex items-center gap-2 text-blue-400 text-[10px] font-black uppercase tracking-wider">
        <Palette size={14} /> Brand Identity Management
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-white/40 text-[10px] uppercase font-bold">Registered Company Profile Name</label>
        <input 
          type="text" 
          value={settings.name || ''} 
          onChange={(e) => setSettings({ ...settings, name: e.target.value })}
          className="bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500/50"
        />
      </div>
      <div className="border border-dashed border-white/10 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer relative hover:bg-white/5 transition-all">
        {isUploading ? (
          <Loader2 size={24} className="text-blue-400 animate-spin" />
        ) : (
          <>
            <UploadCloud size={24} className="text-white/20 mb-2" />
            <span className="font-bold text-white text-[11px]">Upload Corporate Emblem Vector</span>
            <input type="file" onChange={handleLogoUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
          </>
        )}
      </div>
    </div>
  );
}

function InfrastructureSection({ settings, setSettings }: any) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/20 p-6 space-y-4">
      <div className="flex items-center gap-2 text-purple-400 text-[10px] font-black uppercase tracking-wider">
        <Key size={14} /> Telephony & Communication Anchors
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-white/40 text-[10px] uppercase font-bold">Twilio Account SID Token</label>
        <input 
          type="password" 
          value={settings.twilioSid || ''} 
          placeholder={settings.twilioSid ? '••••••••••••••••••••••••' : 'Enter Twilio Access Token'}
          onChange={(e) => setSettings({ ...settings, twilioSid: e.target.value })}
          className="bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-purple-500/50 font-mono"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-white/40 text-[10px] uppercase font-bold">SendGrid API Access Token</label>
        <input 
          type="password" 
          value={settings.sendGridKey || ''} 
          placeholder={settings.sendGridKey ? '••••••••••••••••••••••••' : 'Enter SendGrid API Token'}
          onChange={(e) => setSettings({ ...settings, sendGridKey: e.target.value })}
          className="bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-purple-500/50 font-mono"
        />
      </div>
    </div>
  );
}

function FeatureToggle({ label, enabled }: { label: string, enabled: boolean }) {
  const [active, setActive] = useState(enabled);
  return (
    <div className="flex justify-between items-center p-4 bg-white/5 border border-white/5 rounded-xl hover:border-white/10 transition-all text-xs font-bold text-slate-300">
      <span>{label}</span>
      <button type="button" onClick={() => setActive(!active)} className="text-slate-400 hover:text-white transition-colors">
        {active ? <ToggleRight size={24} className="text-emerald-400" /> : <ToggleLeft size={24} className="text-white/20" />}
      </button>
    </div>
  );
}

