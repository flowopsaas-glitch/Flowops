import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client'; 
import { Package, MapPin, Eye, Truck, Search, RefreshCw, Filter } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import PageSkeleton from '@/components/ui/PageSkeleton';
import EmptyState from '@/components/ui/EmptyState';
import EvidenceModal from '../components/Shipments/EvidenceModal';

interface Waybill {
  id: number;
  waybillNumber: string;
  status: string;
  recipient: string;
  senderName?: string;
  receiverName?: string;
  signatureUrl: string | null;
  imageUrl: string | null;
  createdAt: string;
  totalAmount?: number;
  currentBranch?: { name: string };
}

const statusConfig: Record<string, { bg: string; color: string }> = {
  DELIVERED: { bg: 'rgba(74,222,128,0.12)', color: '#4ADE80' },
  IN_TRANSIT: { bg: 'rgba(108,158,255,0.12)', color: '#6C9EFF' },
  PENDING: { bg: 'rgba(251,191,36,0.12)', color: '#FBBF24' },
  PENDING_COLLECTION: { bg: 'rgba(167,139,250,0.12)', color: '#A78BFA' },
  FAILED: { bg: 'rgba(248,113,113,0.12)', color: '#F87171' },
  CANCELLED: { bg: 'rgba(248,113,113,0.12)', color: '#F87171' },
};

export default function ShipmentsPage() {
  const [waybills, setWaybills] = useState<Waybill[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedWaybill, setSelectedWaybill] = useState<Waybill | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const navigate = useNavigate();

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/waybills');
      setWaybills(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch shipments:', err);
      setWaybills([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = waybills.filter(wb => {
    const matchSearch = !search || 
      wb.waybillNumber?.toLowerCase().includes(search.toLowerCase()) ||
      wb.senderName?.toLowerCase().includes(search.toLowerCase()) ||
      wb.receiverName?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || wb.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const openEvidence = (wb: Waybill) => {
    setSelectedWaybill(wb);
    setIsModalOpen(true);
  };

  const inTransitCount = waybills.filter(w => w.status === 'IN_TRANSIT').length;

  return (
    <div style={{ padding: '24px', minHeight: '100%' }}>
      <PageHeader icon={Package} title="Shipments" description="Track and manage all shipments across your network" color="#6C9EFF">
        <button onClick={fetchData} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
          background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
          border: 'none', cursor: 'pointer',
        }}>
          <RefreshCw size={13} /> Refresh
        </button>
        <button onClick={() => navigate('/driver-dispatch')} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
          background: 'linear-gradient(135deg, #6C9EFF, #A78BFA)', color: 'white',
          border: 'none', cursor: 'pointer',
        }}>
          <Truck size={13} /> Dispatch ({inTransitCount})
        </button>
      </PageHeader>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search waybills, sender, receiver..."
            style={{ width: '100%', paddingLeft: '36px', paddingRight: '12px', paddingTop: '10px', paddingBottom: '10px', borderRadius: '10px', fontSize: '13px', color: 'white', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: '10px', fontSize: '13px', color: 'white', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }}>
          <option value="" style={{ background: '#0f1629' }}>All Statuses</option>
          <option value="PENDING" style={{ background: '#0f1629' }}>Pending</option>
          <option value="IN_TRANSIT" style={{ background: '#0f1629' }}>In Transit</option>
          <option value="DELIVERED" style={{ background: '#0f1629' }}>Delivered</option>
          <option value="FAILED" style={{ background: '#0f1629' }}>Failed</option>
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <PageSkeleton type="table" rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title={search || statusFilter ? "No matching shipments" : "No shipments yet"}
          description={search || statusFilter ? "Try adjusting your search or filters." : "Create your first waybill to start tracking shipments."}
          actionLabel={!search && !statusFilter ? "Go to Waybill Inbox" : undefined}
          actionPath="/waybills/inbox"
          color="#6C9EFF"
        />
      ) : (
        <div style={{ borderRadius: '12px', overflow: 'hidden', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Waybill #', 'Sender', 'Receiver', 'Hub', 'Status', 'Amount', 'Created', ''].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((wb, i) => {
                const sc = statusConfig[wb.status] || statusConfig.PENDING;
                return (
                  <tr key={wb.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                    className="hover:bg-white/[0.02] transition-colors">
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#6C9EFF' }}>{wb.waybillNumber || `WB-${wb.id}`}</td>
                    <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.7)' }}>{wb.senderName || '—'}</td>
                    <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.7)' }}>{wb.receiverName || wb.recipient || '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                        <MapPin size={11} color="#6C9EFF" /> {wb.currentBranch?.name || 'Unassigned'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', background: sc.bg, color: sc.color }}>
                        {wb.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'white', fontWeight: 500 }}>
                      {wb.totalAmount ? `R${wb.totalAmount.toLocaleString()}` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
                      {wb.createdAt ? new Date(wb.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {wb.status === 'DELIVERED' && (
                        <button onClick={() => openEvidence(wb)} style={{
                          display: 'flex', alignItems: 'center', gap: '4px',
                          fontSize: '11px', fontWeight: 500, color: '#6C9EFF',
                          background: 'none', border: 'none', cursor: 'pointer',
                        }}>
                          <Eye size={12} /> POD
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Evidence Modal */}
      {selectedWaybill && (
        <EvidenceModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          waybillId={selectedWaybill.id} 
          signatureUrl={selectedWaybill.signatureUrl} 
          imageUrl={selectedWaybill.imageUrl}
          waybillNumber={selectedWaybill.waybillNumber} 
        />
      )}
    </div>
  );
}
