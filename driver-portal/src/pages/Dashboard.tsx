import { useEffect, useState, useRef } from 'react';
import {
  Truck, Package, MapPin, LogOut, RefreshCw, Navigation, Inbox,
  ClipboardList, TrendingUp, DollarSign, Clock, Wifi, WifiOff,
  PenTool, Camera, X, Check, Loader2
} from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import { driverApi } from '../services/api';
import { useGeolocation } from '../hooks/useGeolocation';
import DeliveryMap from '../components/DeliveryMap';
import Analytics from '../components/Analytics';
import QRScanner from '../components/QRScanner';
import RouteOptimizer from '../components/RouteOptimizer';
import OfflineIndicator from '../components/OfflineIndicator';
import DashboardHeader from '../components/DashboardHeader';
import { cacheWaybills, getCachedWaybills } from '../services/offlineDB';
import { syncAction } from '../services/syncHandler';

interface DashboardProps {
  driver: any;
  onLogout: () => void;
  onSelectDelivery: (waybill: any) => void;
}

export default function Dashboard({ driver, onLogout, onSelectDelivery }: DashboardProps) {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [gpsActive, setGpsActive] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'deliveries' | 'collections' | 'map' | 'analytics' | 'route'>('all');
  const [darkMode, setDarkMode] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [deliveryTime, setDeliveryTime] = useState(0);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const geo = useGeolocation(gpsActive, 30000);

  // POC modal
  const [pocCollection, setPocCollection] = useState<any>(null);
  const [collectorName, setCollectorName] = useState('');
  const [pocNotes, setPocNotes] = useState('');
  const [pocPhoto, setPocPhoto] = useState<string | null>(null);
  const [savingPoc, setSavingPoc] = useState(false);
  const sigPad = useRef<any>(null);

  useEffect(() => {
    loadDeliveries();
    setGpsActive(true);
    const interval = setInterval(() => setDeliveryTime(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const hOnline = () => setOnline(true);
    const hOffline = () => setOnline(false);
    window.addEventListener('online', hOnline);
    window.addEventListener('offline', hOffline);
    return () => {
      window.removeEventListener('online', hOnline);
      window.removeEventListener('offline', hOffline);
    };
  }, []);

  useEffect(() => {
    if (geo.latitude && geo.longitude) {
      driverApi.updateGps(driver.driverId, geo.latitude, geo.longitude, geo.speed || 0)
        .catch((err: any) => console.error('GPS failed:', err));
    }
  }, [geo.latitude, geo.longitude]);

  const loadDeliveries = async () => {
    setLoading(true);
    try {
      // Load deliveries and collections in parallel
      const [deliveriesRes, collectionsRes] = await Promise.allSettled([
        driverApi.getDeliveries(driver.driverId),
        driverApi.getCollections(driver.driverId),
      ]);

      if (deliveriesRes.status === 'fulfilled') {
        const all = deliveriesRes.value.data;
        setDeliveries(all);
        await cacheWaybills(all);
      } else {
        const cached = await getCachedWaybills();
        setDeliveries(cached);
      }

      if (collectionsRes.status === 'fulfilled') {
        setCollections(collectionsRes.value.data || []);
      }
    } catch (err) {
      console.error('Failed to load, trying cache...');
      const cached = await getCachedWaybills();
      setDeliveries(cached);
    } finally {
      setLoading(false);
    }
  };

  const submitPoc = async () => {
    if (!pocCollection) return;
    setSavingPoc(true);
    try {
      const signatureData = sigPad.current && !sigPad.current.isEmpty()
        ? sigPad.current.toDataURL('image/png') : undefined;
      await driverApi.uploadPoc({
        driverId: driver.driverId,
        collectionId: pocCollection.id,
        signatureData,
        photoData: pocPhoto || undefined,
        collectorName: collectorName || undefined,
        notes: pocNotes || undefined,
      });
      setPocCollection(null);
      setCollectorName('');
      setPocNotes('');
      setPocPhoto(null);
      loadDeliveries();
    } catch (err: any) {
      alert('POC failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setSavingPoc(false);
    }
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setPocPhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const getStatusGradient = (s: string) => {
    const m: Record<string, string> = {
      PENDING: 'from-yellow-500 to-orange-500',
      IN_TRANSIT: 'from-blue-500 to-cyan-500',
      DELIVERED: 'from-green-500 to-emerald-500',
      EXCEPTION: 'from-red-500 to-pink-500',
    };
    return m[s] || 'from-gray-500 to-gray-600';
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const totalEarnings = collections.filter(c => c.status === 'COLLECTED').length * 50
    + deliveries.filter(d => d.status === 'DELIVERED').length * 75;
  const todayEarnings = deliveries.filter(d => {
    const deliveredAt = new Date(d.deliveredAt || d.updatedAt);
    const today = new Date();
    return deliveredAt.toDateString() === today.toDateString();
  }).length * 75;

  const filtered = activeTab === 'all' ? [...collections, ...deliveries]
    : activeTab === 'collections' ? collections
    : activeTab === 'deliveries' ? deliveries
    : [...collections, ...deliveries];

  const bgClass = darkMode ? 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900' : 'bg-gradient-to-br from-gray-100 via-blue-50 to-gray-100';
  const cardBg = darkMode ? 'bg-white/5 border-white/10' : 'bg-white/80 border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-300' : 'text-gray-600';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

  const handleQRScan = (waybillNumber: string) => {
    setShowQRScanner(false);
    const all = [...collections, ...deliveries];
    const match = all.find(w => w.waybillNumber === waybillNumber);
    if (match) onSelectDelivery(match);
    else alert(`Waybill ${waybillNumber} not found in your assignments`);
  };

  return (
    <>
      <DashboardHeader driver={driver} online={online} gpsActive={gpsActive} onLogout={onLogout} onRefresh={loadDeliveries} />
      <div className={`min-h-screen ${bgClass} safe-area-top safe-area-bottom transition-colors duration-300`}>
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className={`absolute -top-40 -right-40 w-80 h-80 rounded-full mix-blend-multiply filter blur-3xl animate-blob ${darkMode ? 'bg-purple-500 opacity-10' : 'bg-blue-300 opacity-20'}`}></div>
          <div className={`absolute -bottom-40 -left-40 w-80 h-80 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000 ${darkMode ? 'bg-blue-500 opacity-10' : 'bg-purple-300 opacity-20'}`}></div>
        </div>

        {/* Header */}
        <div className={`relative backdrop-blur-xl ${cardBg} border-b p-4 shadow-lg`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Truck className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className={`font-bold text-xl ${textPrimary}`}>{driver.name}</h1>
                <p className={`text-xs ${textMuted}`}>{driver.vehicleReg}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowQRScanner(true)} className={`p-3 rounded-xl border backdrop-blur-sm transition-all ${darkMode ? 'hover:bg-white/10 border-white/10' : 'hover:bg-gray-200 border-gray-300'}`} title="Scan Waybill QR">
                <span className="text-xl">📷</span>
              </button>
              <button onClick={() => setDarkMode(!darkMode)} className={`p-3 rounded-xl border backdrop-blur-sm transition-all ${darkMode ? 'hover:bg-white/10 border-white/10' : 'hover:bg-gray-200 border-gray-300'}`}>
                <span className="text-xl">{darkMode ? '☀️' : '🌙'}</span>
              </button>
              <button onClick={onLogout} className={`p-3 rounded-xl border backdrop-blur-sm transition-all ${darkMode ? 'hover:bg-white/10 border-white/10' : 'hover:bg-gray-200 border-gray-300'}`}>
                <LogOut className={`w-5 h-5 ${textSecondary}`} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className={`flex items-center space-x-2 text-xs ${cardBg} backdrop-blur-sm border rounded-xl p-3`}>
              {online ? <Wifi className="w-4 h-4 text-green-400" /> : <WifiOff className="w-4 h-4 text-red-400" />}
              <span className={textSecondary}>{online ? 'Online' : 'Offline'}</span>
            </div>
            <div className={`flex items-center space-x-2 text-xs ${cardBg} backdrop-blur-sm border rounded-xl p-3`}>
              <Navigation className={`w-4 h-4 ${gpsActive ? 'text-green-400 animate-pulse' : 'text-gray-400'}`} />
              <span className={textSecondary}>
                {geo.loading ? 'GPS...' : geo.error ? 'GPS Off' : `${geo.latitude?.toFixed(3)}, ${geo.longitude?.toFixed(3)}`}
              </span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="relative grid grid-cols-2 gap-3 p-4">
          <div className={`backdrop-blur-xl ${cardBg} border rounded-2xl p-4 shadow-lg`}>
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="w-5 h-5 text-purple-400" />
              <Clock className="w-4 h-4 text-blue-400" />
            </div>
            <div className={`text-2xl font-bold ${textPrimary}`}>{formatTime(deliveryTime)}</div>
            <div className={`text-xs ${textMuted}`}>Shift Time</div>
          </div>
          <div className={`backdrop-blur-xl ${cardBg} border rounded-2xl p-4 shadow-lg`}>
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="w-5 h-5 text-green-400" />
              <span className="text-xs text-green-400">Today</span>
            </div>
            <div className="text-2xl font-bold text-green-400">R{todayEarnings}</div>
            <div className={`text-xs ${textMuted}`}>Total: R{totalEarnings}</div>
          </div>
          <div className={`backdrop-blur-xl ${cardBg} border rounded-2xl p-4 shadow-lg`}>
            <Inbox className="w-5 h-5 text-yellow-400 mb-2" />
            <div className={`text-3xl font-bold ${textPrimary}`}>{collections.length}</div>
            <div className={`text-xs ${textMuted}`}>Collections</div>
          </div>
          <div className={`backdrop-blur-xl ${cardBg} border rounded-2xl p-4 shadow-lg`}>
            <ClipboardList className="w-5 h-5 text-green-400 mb-2" />
            <div className={`text-3xl font-bold ${textPrimary}`}>{deliveries.filter(d => d.status === 'DELIVERED').length}</div>
            <div className={`text-xs ${textMuted}`}>Delivered</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="relative px-4 mb-4">
          <div className={`backdrop-blur-xl ${cardBg} border rounded-2xl p-1 flex gap-1 flex-wrap`}>
            {(['all', 'collections', 'deliveries', 'map', 'analytics', 'route'] as const).map((tab) => {
              const count = tab === 'all' ? deliveries.length + collections.length
                : tab === 'collections' ? collections.length
                : tab === 'deliveries' ? deliveries.length : '';
              const gradients: Record<string, string> = {
                all: 'from-blue-600 to-purple-600',
                collections: 'from-yellow-600 to-orange-600',
                deliveries: 'from-green-600 to-emerald-600',
                map: 'from-cyan-600 to-blue-600',
                analytics: 'from-pink-600 to-purple-600',
                route: 'from-orange-600 to-red-600',
              };
              const labels: Record<string, string> = {
                all: 'All', collections: 'Collections', deliveries: 'Deliveries',
                map: 'Map', analytics: 'Analytics', route: 'Route',
              };
              return (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`flex-1 min-w-[80px] py-3 px-2 rounded-xl text-xs font-semibold transition-all ${activeTab === tab ? `bg-gradient-to-r ${gradients[tab]} text-white shadow-lg` : `${textMuted} hover:${textPrimary} hover:bg-white/5`}`}>
                  {labels[tab]} {count !== '' && `(${count})`}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="relative px-4 pb-4">
          {activeTab !== 'map' && activeTab !== 'analytics' && activeTab !== 'route' && (
            <div className="flex items-center justify-between mb-3">
              <h2 className={`font-bold text-lg ${textPrimary}`}>
                {activeTab === 'all' ? 'All Jobs' : activeTab === 'collections' ? 'Collections' : 'Deliveries'}
              </h2>
              <button onClick={loadDeliveries} className={`p-2 rounded-xl border backdrop-blur-sm ${darkMode ? 'hover:bg-white/10 border-white/10' : 'hover:bg-gray-200 border-gray-300'}`}>
                <RefreshCw className={`w-4 h-4 ${textSecondary} ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          )}

          {activeTab === 'map' && (
            <DeliveryMap deliveries={filtered} userLocation={geo.latitude && geo.longitude ? { lat: geo.latitude, lng: geo.longitude } : null} darkMode={darkMode} />
          )}
          {activeTab === 'analytics' && (
            <Analytics deliveries={deliveries} collections={collections} darkMode={darkMode} />
          )}
          {activeTab === 'route' && (
            <RouteOptimizer deliveries={filtered} userLocation={geo.latitude && geo.longitude ? { lat: geo.latitude, lng: geo.longitude } : null} darkMode={darkMode} />
          )}

          {activeTab !== 'map' && activeTab !== 'analytics' && activeTab !== 'route' && (
            loading && filtered.length === 0 ? (
              <div className={`text-center py-8 ${textMuted}`}>
                <div className="w-8 h-8 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin mx-auto mb-2" />
                Loading...
              </div>
            ) : filtered.length === 0 ? (
              <div className={`text-center py-8 backdrop-blur-xl ${cardBg} border rounded-2xl`}>
                <Package className={`w-12 h-12 ${textMuted} mx-auto mb-2`} />
                <p className={textMuted}>No jobs assigned</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((w) => {
                  // Determine if this is a collection (from collections array) or delivery
                  const isCollection = collections.some(c => c.id === w.id);
                  const collected = isCollection && w.status === 'COLLECTED';
                  return (
                    <div key={`${isCollection ? 'col' : 'del'}-${w.id}`}
                      className={`w-full backdrop-blur-xl ${cardBg} border rounded-2xl p-4 shadow-lg`}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className={`font-bold text-lg ${textPrimary}`}>
                            {isCollection ? (w.referenceNo || w.name) : w.waybillNumber}
                          </div>
                          <div className={`text-xs ${textMuted}`}>
                            {isCollection ? `📦 Collection${w.clientName ? ` • ${w.clientName}` : ''}` : `#${w.id}`}
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r ${getStatusGradient(w.status || 'PENDING')} text-white shadow-lg`}>
                          {(w.status || 'PENDING').replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex items-start text-gray-300 mb-3">
                        <MapPin className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0 text-green-400" />
                        <div>
                          <div className={`font-medium ${textPrimary}`}>
                            {isCollection ? (w.collectionAddress || 'No address') : (w.receiverName || 'Recipient')}
                          </div>
                          <div className={`text-xs ${textMuted}`}>
                            {isCollection ? '' : (w.destination || 'No destination')}
                          </div>
                          {!isCollection && w.receiverPhone && (
                            <div className={`text-xs ${textMuted} mt-1`}>📞 {w.receiverPhone}</div>
                          )}
                        </div>
                      </div>
                      {/* Actions */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const addr = isCollection ? w.collectionAddress : w.destination;
                            if (addr) window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`, '_blank');
                          }}
                          className="flex-1 py-2 bg-blue-600/20 text-blue-300 rounded-xl text-xs font-bold border border-blue-600/30">
                          🗺️ Map
                        </button>
                        {isCollection ? (
                          <button
                            disabled={collected}
                            onClick={() => !collected && (setPocCollection(w), setCollectorName(''), setPocNotes(''), setPocPhoto(null))}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold ${collected ? 'bg-green-600/20 text-green-400 border border-green-600/30' : 'bg-orange-600/20 text-orange-300 border border-orange-600/30'}`}>
                            {collected ? '✅ Collected' : '✍️ POC'}
                          </button>
                        ) : (
                          <button onClick={() => onSelectDelivery(w)}
                            className="flex-1 py-2 bg-green-600/20 text-green-300 rounded-xl text-xs font-bold border border-green-600/30">
                            ✍️ POD
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        <OfflineIndicator darkMode={darkMode} apiCall={syncAction} />
        {showQRScanner && <QRScanner onScan={handleQRScan} onClose={() => setShowQRScanner(false)} darkMode={darkMode} />}
      </div>

      {/* POC Modal */}
      {pocCollection && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">Proof of Collection</h3>
                <p className="text-xs text-orange-400 font-bold">{pocCollection.referenceNo || pocCollection.name}</p>
              </div>
              <button onClick={() => setPocCollection(null)} className="text-white/40"><X size={20} /></button>
            </div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Collected From</label>
            <input value={collectorName} onChange={e => setCollectorName(e.target.value)} placeholder="Person handing over"
              className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm outline-none mb-4" />
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Signature</label>
            <div className="rounded-2xl overflow-hidden border border-white/10 bg-white mb-2">
              <SignatureCanvas ref={sigPad} penColor="black"
                canvasProps={{ style: { width: '100%', height: 140 }, height: 140 }} />
            </div>
            <button onClick={() => sigPad.current?.clear()} className="text-xs font-bold uppercase text-gray-500 mb-4">Clear</button>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Photo (optional)</label>
            {pocPhoto ? (
              <div className="relative mb-4">
                <img src={pocPhoto} alt="POC" className="w-full h-36 object-cover rounded-2xl" />
                <button onClick={() => setPocPhoto(null)} className="absolute top-2 right-2 bg-black/60 p-1.5 rounded-full text-white"><X size={14} /></button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-white/5 border border-dashed border-white/10 text-gray-400 text-xs font-bold uppercase mb-4 cursor-pointer">
                <Camera size={14} /> Take Photo
                <input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" />
              </label>
            )}
            <textarea value={pocNotes} onChange={e => setPocNotes(e.target.value)} placeholder="Notes (optional)" rows={2}
              className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm outline-none mb-4 resize-none" />
            <button onClick={submitPoc} disabled={savingPoc}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-600 to-yellow-600 text-white font-bold text-xs uppercase shadow-lg flex items-center justify-center gap-2">
              {savingPoc ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Check size={14} /> Confirm Collection</>}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
