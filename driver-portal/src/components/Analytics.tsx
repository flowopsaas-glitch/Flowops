import { useMemo } from 'react';
import { TrendingUp, DollarSign, CheckCircle2, Package } from 'lucide-react';

type Job = Record<string, any> & { id: string; status: string };

export default function Analytics({ jobs }: { jobs: Job[] }) {
  const s = useMemo(() => {
    const total = jobs.length;
    const collections = jobs.filter((j) => j.status === 'PENDING').length;
    const deliveries = jobs.filter((j) => j.status !== 'PENDING').length;
    const delivered = jobs.filter((j) => j.status === 'DELIVERED').length;
    const finished = jobs.filter((j) => j.status === 'DELIVERED' || j.status === 'FAILED' || j.status === 'RETURNED').length;
    const successRate = finished ? Math.round((delivered / finished) * 100) : 0;
    const codOutstanding = jobs
      .filter((j) => Number(j.codAmount) > 0 && !j.codCollected)
      .reduce((sum, j) => sum + Number(j.codAmount || 0), 0);
    return { total, collections, deliveries, delivered, successRate, codOutstanding };
  }, [jobs]);

  const max = Math.max(s.collections, s.deliveries, s.delivered, 1);
  const Bar = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div className="flex items-center gap-3">
      <span className="w-24 text-xs text-gray-400 shrink-0">{label}</span>
      <div className="flex-1 h-3 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round((value / max) * 100)}%` }} />
      </div>
      <span className="w-8 text-right text-sm font-bold">{value}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card icon={<CheckCircle2 className="w-5 h-5 text-green-400" />} value={`${s.successRate}%`} label="Success rate" />
        <Card icon={<DollarSign className="w-5 h-5 text-red-300" />} value={`R${s.codOutstanding.toFixed(0)}`} label="COD to collect" />
        <Card icon={<Package className="w-5 h-5 text-cyan-400" />} value={s.deliveries} label="Deliveries" />
        <Card icon={<TrendingUp className="w-5 h-5 text-yellow-400" />} value={s.collections} label="Collections" />
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="text-sm font-semibold mb-1">Job breakdown</div>
        <Bar label="Collections" value={s.collections} color="bg-yellow-500" />
        <Bar label="Deliveries" value={s.deliveries} color="bg-cyan-500" />
        <Bar label="Delivered" value={s.delivered} color="bg-green-500" />
      </div>
    </div>
  );
}

function Card({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-2">{icon}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  );
}
