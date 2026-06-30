import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Truck, Package, MapPin, LogOut, RefreshCw, Navigation, Inbox,
  ClipboardList, MessageCircle, Wifi, WifiOff, ChevronRight,
} from 'lucide-react';
import api from '../services/api';
import { clearSession, getStoredDriver } from '../services/auth';
import { useGeolocation } from '../hooks/useGeolocation';
import { cacheJobs, getCachedJobs } from '../services/offlineDB';

type Job = Record<string, any> & { id: string; status: string; type?: string };
type Tab = 'all' | 'collections' | 'deliveries';

export default function Dashboard() {
  const navigate = useNavigate();
  const driver = getStoredDriver();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [online, setOnline] = useState(navigator.onLine);
  const geo = useGeolocation(true, 30000);

  useEffect(() => {
    if (!driver) { navigate('/login', { replace: true }); return; }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Push GPS fixes to dispatch.
  useEffect(() => {
    if (geo.latitude != null && geo.longitude != null) {
      api.post('/driver-portal/gps', { lat: geo.latitude, lng: geo.longitude, speed: geo.speed ?? 0 }).catch(() => undefined);
    }
  }, [geo.latitude, geo.longitude, geo.speed]);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<Job[]>('/driver-portal/deliveries');
      const all = Array.isArray(data) ? data : [];
      setJobs(all);
      void cacheJobs(all);
    } catch {
      const cached = await getCachedJobs();
      if (cached.length) setJobs(cached as Job[]);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    clearSession();
    navigate('/login', { replace: true });
  }

  const collections = useMemo(() => jobs.filter((j) => j.status === 'PENDING'), [jobs]);
  const deliveries = useMemo(() => jobs.filter((j) => j.status !== 'PENDING'), [jobs]);
  const delivered = useMemo(() => jobs.filter((j) => j.status === 'DELIVERED').length, [jobs]);
  const visible = tab === 'collections' ? collections : tab === 'deliveries' ? deliveries : jobs;

  const statusColor = (s: string) =>
    s === 'PENDING' ? 'from-yellow-500 to-orange-500'
    : s === 'IN_TRANSIT' ? 'from-blue-500 to-cyan-500'
    : s === 'DELIVERED' ? 'from-green-500 to-emerald-500'
    : 'from-gray-500 to-gray-600';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 safe-area-top safe-area-bottom text-white">
      {/* Header */}
      <div className="backdrop-blur-xl bg-white/5 border-b border-white/10 p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">{driver?.name ?? 'Driver'}</h1>
              <p className="text-xs text-gray-400">{driver?.vehicleReg ?? driver?.phone}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/chat')} className="p-3 rounded-xl border border-white/10 hover:bg-white/10 transition" title="Chat with dispatch">
              <MessageCircle className="w-5 h-5 text-blue-300" />
            </button>
            <button onClick={logout} className="p-3 rounded-xl border border-white/10 hover:bg-white/10 transition" title="Sign out">
              <LogOut className="w-5 h-5 text-gray-300" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 text-xs bg-white/5 border border-white/10 rounded-xl p-3">
            {online ? <Wifi className="w-4 h-4 text-green-400" /> : <WifiOff className="w-4 h-4 text-red-400" />}
            <span className="text-gray-300">{online ? 'Online' : 'Offline'}</span>
          </div>
          <div className="flex items-center gap-2 text-xs bg-white/5 border border-white/10 rounded-xl p-3">
            <Navigation className={`w-4 h-4 ${geo.latitude != null ? 'text-green-400 animate-pulse' : 'text-gray-400'}`} />
            <span className="text-gray-300 truncate">
              {geo.loading ? 'GPS…' : geo.error ? 'GPS off' : `${geo.latitude?.toFixed(3)}, ${geo.longitude?.toFixed(3)}`}
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 p-4">
        <Stat icon={<Inbox className="w-5 h-5 text-yellow-400" />} value={collections.length} label="Collections" />
        <Stat icon={<Package className="w-5 h-5 text-cyan-400" />} value={deliveries.length} label="Deliveries" />
        <Stat icon={<ClipboardList className="w-5 h-5 text-green-400" />} value={delivered} label="Delivered" />
      </div>

      {/* Tabs */}
      <div className="px-4 mb-3">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-1 flex gap-1">
          {(['all', 'collections', 'deliveries'] as Tab[]).map((t) => (
            <button
              key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-semibold capitalize transition ${tab === t ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
            >
              {t}{t === 'collections' ? ` (${collections.length})` : t === 'deliveries' ? ` (${deliveries.length})` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="px-4 pb-8 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">{tab === 'collections' ? 'Collections' : tab === 'deliveries' ? 'Deliveries' : 'All Jobs'}</h2>
          <button onClick={load} className="p-2 rounded-xl border border-white/10 hover:bg-white/10">
            <RefreshCw className={`w-4 h-4 text-gray-300 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading && jobs.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <div className="w-8 h-8 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin mx-auto mb-2"></div>
            Loading…
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-10 bg-white/5 border border-white/10 rounded-2xl">
            <Package className="w-12 h-12 text-gray-500 mx-auto mb-2" />
            <p className="text-gray-400">No jobs assigned</p>
          </div>
        ) : (
          visible.map((j) => (
            <button
              key={j.id} onClick={() => navigate(`/delivery/${j.id}`, { state: j })}
              className="w-full text-left bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 transition flex items-center gap-3"
            >
              <div className={`w-1.5 self-stretch rounded-full bg-gradient-to-b ${statusColor(j.status)}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold truncate">{j.trackingNumber ?? j.waybillNumber ?? j.id}</span>
                  <span className="text-[10px] uppercase tracking-wider text-gray-400">{j.status}</span>
                </div>
                <div className="text-sm text-gray-300 truncate mt-0.5">{j.recipientName ?? j.receiverName ?? '—'}</div>
                {(j.recipientAddress ?? j.destination) && (
                  <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                    <MapPin className="w-3 h-3" /> <span className="truncate">{j.recipientAddress ?? j.destination}</span>
                  </div>
                )}
                {Number(j.codAmount) > 0 && (
                  <div className="mt-1 inline-block text-[11px] font-bold text-red-300 bg-red-500/15 border border-red-500/30 rounded-md px-2 py-0.5">
                    COD R{Number(j.codAmount).toFixed(2)}
                  </div>
                )}
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500 shrink-0" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
      <div className="mb-2">{icon}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  );
}
