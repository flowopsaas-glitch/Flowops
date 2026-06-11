import { useState, useEffect, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Package, PackageCheck, PackageMinus, Search, PenTool, X, CheckCircle, Loader2, Building2 } from 'lucide-react';
import axios from 'axios';
import { FLOWOPS_API_URL } from '@/lib/env';

type ModalType = 'none' | 'checkin' | 'checkout';

export default function WarehouseClerkDashboard() {
  const [warehouseId, setWarehouseId] = useState<number>(1);
  const [stats, setStats] = useState<any>(null);
  const [parcels, setParcels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals
  const [activeModal, setActiveModal] = useState<ModalType>('none');
  const [modalLoading, setModalLoading] = useState(false);
  const sigPad = useRef<any>(null);
  
  // Form states
  const [checkInForm, setCheckInForm] = useState({
    senderName: '', senderPhone: '', receiverName: '', receiverPhone: '',
    destination: '', description: '', weight: '', storageLocation: ''
  });
  const [checkOutForm, setCheckOutForm] = useState({
    waybillNumber: '', collectorName: '', collectorPhone: '', collectorId: ''
  });
  const [foundWaybill, setFoundWaybill] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, [warehouseId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const [statsRes, parcelsRes] = await Promise.all([
        axios.get(`${FLOWOPS_API_URL}/warehouse-clerk/overview/${warehouseId}`, { headers }),
        axios.get(`${FLOWOPS_API_URL}/warehouse-clerk/recent/${warehouseId}?limit=20`, { headers })
      ]);
      
      setStats(statsRes.data.stats);
      setParcels(parcelsRes.data);
    } catch (error) {
      console.error('Failed to load warehouse data', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) { loadData(); return; }
    try {
      const token = localStorage.getItem('access_token');
      const res = await axios.get(`${FLOWOPS_API_URL}/warehouse-clerk/search/${warehouseId}?q=${searchQuery}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setParcels(res.data);
    } catch (error) {
      console.error('Search failed', error);
    }
  };

  const handleCheckIn = async () => {
    if (sigPad.current?.isEmpty()) {
      alert('Please capture the sender signature!');
      return;
    }
    setModalLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const signatureData = sigPad.current.getTrimmedCanvas().toDataURL('image/png');
      
      await axios.post(`${FLOWOPS_API_URL}/warehouse-clerk/check-in`, {
        warehouseId,
        ...checkInForm,
        weight: parseFloat(checkInForm.weight) || undefined,
        signatureData
      }, { headers: { Authorization: `Bearer ${token}` } });
      
      alert('✅ Parcel checked in successfully!');
      setActiveModal('none');
      setCheckInForm({ senderName: '', senderPhone: '', receiverName: '', receiverPhone: '', destination: '', description: '', weight: '', storageLocation: '' });
      loadData();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Check-in failed');
    } finally {
      setModalLoading(false);
    }
  };

  const handleFindWaybill = async () => {
    if (!checkOutForm.waybillNumber) return;
    try {
      const token = localStorage.getItem('access_token');
      const res = await axios.get(`${FLOWOPS_API_URL}/warehouse-clerk/search/${warehouseId}?q=${checkOutForm.waybillNumber}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.length > 0) {
        setFoundWaybill(res.data[0]);
      } else {
        alert('Waybill not found in this warehouse.');
        setFoundWaybill(null);
      }
    } catch (error) {
      alert('Search failed');
    }
  };

  const handleCheckOut = async () => {
    if (!foundWaybill) return;
    if (sigPad.current?.isEmpty()) {
      alert('Please capture the collector signature!');
      return;
    }
    setModalLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const signatureData = sigPad.current.getTrimmedCanvas().toDataURL('image/png');
      
      await axios.post(`${FLOWOPS_API_URL}/warehouse-clerk/check-out`, {
        waybillId: foundWaybill.id,
        warehouseId,
        collectorName: checkOutForm.collectorName,
        collectorPhone: checkOutForm.collectorPhone,
        collectorIdNumber: checkOutForm.collectorId,
        signatureData
      }, { headers: { Authorization: `Bearer ${token}` } });
      
      alert('✅ Parcel handed over successfully!');
      setActiveModal('none');
      setCheckOutForm({ waybillNumber: '', collectorName: '', collectorPhone: '', collectorId: '' });
      setFoundWaybill(null);
      loadData();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Check-out failed');
    } finally {
      setModalLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RECEIVED': return 'bg-blue-100 text-blue-800';
      case 'IN_WAREHOUSE': return 'bg-purple-100 text-purple-800';
      case 'READY_FOR_COLLECTION': return 'bg-amber-100 text-amber-800';
      case 'COLLECTED': return 'bg-green-100 text-green-800';
      case 'DELIVERED': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-600 rounded-xl text-white">
            <Building2 className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Warehouse Clerk Portal</h1>
            <p className="text-gray-500 text-sm">Manage incoming and outgoing parcels</p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <button onClick={() => setActiveModal('checkin')} className="flex-1 md:flex-none px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
            <PackageMinus className="w-5 h-5" /> Receive Parcel
          </button>
          <button onClick={() => setActiveModal('checkout')} className="flex-1 md:flex-none px-6 py-3 bg-green-600 text-white rounded-xl font-semibold shadow-lg shadow-green-200 hover:bg-green-700 transition-all flex items-center justify-center gap-2">
            <PackageCheck className="w-5 h-5" /> Handover Parcel
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        <StatCard title="Total Parcels" value={stats?.totalParcels || 0} icon={<Package />} color="blue" />
        <StatCard title="Pending Pickup" value={stats?.pendingPickup || 0} icon={<Truck />} color="amber" />
        <StatCard title="Ready to Collect" value={stats?.pendingCollection || 0} icon={<PackageCheck />} color="purple" />
        <StatCard title="Received Today" value={stats?.todayIn || 0} icon={<PackageMinus />} color="green" />
        <StatCard title="Dispatched Today" value={stats?.todayOut || 0} icon={<PackageCheck />} color="indigo" />
      </div>

      {/* Search & Parcels List */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search waybill, phone number, or name..."
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button onClick={handleSearch} className="px-6 py-3 bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800">
            Search
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Waybill</th>
                <th className="px-6 py-4">Sender</th>
                <th className="px-6 py-4">Receiver</th>
                <th className="px-6 py-4">Destination</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {parcels.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">No parcels found</td></tr>
              ) : parcels.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-gray-900">{p.waybillNumber}</td>
                  <td className="px-6 py-4 text-gray-700">{p.senderName}<br/><span className="text-xs text-gray-500">{p.senderPhone}</span></td>
                  <td className="px-6 py-4 text-gray-700">{p.receiverName}<br/><span className="text-xs text-gray-500">{p.receiverPhone}</span></td>
                  <td className="px-6 py-4 text-gray-700">{p.destination}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(p.status)}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{new Date(p.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CHECK-IN MODAL */}
      {activeModal === 'checkin' && (
        <Modal title="Receive Parcel (Check-In)" onClose={() => setActiveModal('none')}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Sender Name" value={checkInForm.senderName} onChange={v => setCheckInForm({...checkInForm, senderName: v})} />
              <Input label="Sender Phone" value={checkInForm.senderPhone} onChange={v => setCheckInForm({...checkInForm, senderPhone: v})} />
              <Input label="Receiver Name" value={checkInForm.receiverName} onChange={v => setCheckInForm({...checkInForm, receiverName: v})} />
              <Input label="Receiver Phone" value={checkInForm.receiverPhone} onChange={v => setCheckInForm({...checkInForm, receiverPhone: v})} />
              <Input label="Destination" value={checkInForm.destination} onChange={v => setCheckInForm({...checkInForm, destination: v})} />
              <Input label="Storage Location (e.g., Shelf A1)" value={checkInForm.storageLocation} onChange={v => setCheckInForm({...checkInForm, storageLocation: v})} />
              <Input label="Weight (kg)" type="number" value={checkInForm.weight} onChange={v => setCheckInForm({...checkInForm, weight: v})} />
              <Input label="Description" value={checkInForm.description} onChange={v => setCheckInForm({...checkInForm, description: v})} />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Sender Signature</label>
              <div className="border-2 border-gray-300 rounded-xl overflow-hidden bg-white">
                <SignatureCanvas ref={sigPad} penColor='black' canvasProps={{ className: 'w-full h-48 touch-none' }} />
              </div>
              <button onClick={() => sigPad.current?.clear()} className="mt-2 text-sm text-red-600 font-semibold">Clear Signature</button>
            </div>

            <button onClick={handleCheckIn} disabled={modalLoading} className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {modalLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
              Confirm Check-In
            </button>
          </div>
        </Modal>
      )}

      {/* CHECK-OUT MODAL */}
      {activeModal === 'checkout' && (
        <Modal title="Handover Parcel (Check-Out)" onClose={() => setActiveModal('none')}>
          <div className="space-y-4">
            {!foundWaybill ? (
              <>
                <div className="flex gap-2">
                  <Input label="Waybill Number" value={checkOutForm.waybillNumber} onChange={v => setCheckOutForm({...checkOutForm, waybillNumber: v})} className="flex-1" />
                  <button onClick={handleFindWaybill} className="mt-8 px-6 py-3 bg-gray-900 text-white rounded-xl font-semibold">Find</button>
                </div>
              </>
            ) : (
              <>
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                  <p className="font-bold text-green-900">Found: {foundWaybill.waybillNumber}</p>
                  <p className="text-sm text-green-700">To: {foundWaybill.receiverName} ({foundWaybill.receiverPhone})</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="Collector Name" value={checkOutForm.collectorName} onChange={v => setCheckOutForm({...checkOutForm, collectorName: v})} />
                  <Input label="Collector Phone" value={checkOutForm.collectorPhone} onChange={v => setCheckOutForm({...checkOutForm, collectorPhone: v})} />
                  <Input label="ID Number (Optional)" value={checkOutForm.collectorId} onChange={v => setCheckOutForm({...checkOutForm, collectorId: v})} className="md:col-span-2" />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Collector Signature</label>
                  <div className="border-2 border-gray-300 rounded-xl overflow-hidden bg-white">
                    <SignatureCanvas ref={sigPad} penColor='black' canvasProps={{ className: 'w-full h-48 touch-none' }} />
                  </div>
                  <button onClick={() => sigPad.current?.clear()} className="mt-2 text-sm text-red-600 font-semibold">Clear Signature</button>
                </div>

                <button onClick={handleCheckOut} disabled={modalLoading} className="w-full py-4 bg-green-600 text-white rounded-xl font-bold text-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {modalLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                  Confirm Handover
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// Helper Components
const StatCard = ({ title, value, icon, color }: any) => {
  const colors: any = {
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
    green: 'bg-green-50 text-green-600',
    indigo: 'bg-indigo-50 text-indigo-600',
  };
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${colors[color]}`}>{icon}</div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{title}</p>
    </div>
  );
};

const Modal = ({ title, children, onClose }: any) => (
  <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
    <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
      <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"><X className="w-5 h-5" /></button>
      </div>
      <div className="p-6">{children}</div>
    </div>
  </div>
);

const Input = ({ label, value, onChange, type = 'text', className = '' }: any) => (
  <div className={className}>
    <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
  </div>
);
