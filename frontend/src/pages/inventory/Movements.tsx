import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, ArrowLeftRight, Filter, Download } from 'lucide-react';
import { inventoryApi } from '../../lib/inventoryApi';

export default function Movements() {
  const [movements, setMovements] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadMovements(); }, [filter]);

  const loadMovements = async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.getMovements({ 
        type: filter !== 'ALL' ? filter : undefined,
        limit: 50 
      });
      setMovements(res.data);
    } catch (error) {
      console.error('Failed to load movements', error);
    } finally {
      setLoading(false);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'IN': return <ArrowDownRight className="text-emerald-400" size={16} />;
      case 'OUT': return <ArrowUpRight className="text-rose-400" size={16} />;
      case 'TRANSFER': return <ArrowLeftRight className="text-blue-400" size={16} />;
      default: return <ArrowLeftRight className="text-slate-400" size={16} />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'IN': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'OUT': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'TRANSFER': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white p-6 md:p-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black">Stock Movements</h1>
          <p className="text-slate-400 text-sm">Complete audit trail of all inventory changes.</p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-slate-800 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-700 transition">
            <Download size={16} /> Export
          </button>
          <button className="px-4 py-2 bg-slate-800 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-700 transition">
            <Filter size={16} /> Filter
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {['ALL', 'IN', 'OUT', 'TRANSFER', 'ADJUSTMENT', 'RETURN'].map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition ${
              filter === type 
                ? 'bg-blue-600 text-white' 
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Movements Table */}
      <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-black/40 border-b border-white/5">
              <tr>
                <th className="text-left text-xs font-bold uppercase tracking-wider text-slate-400 p-4">Type</th>
                <th className="text-left text-xs font-bold uppercase tracking-wider text-slate-400 p-4">Item</th>
                <th className="text-left text-xs font-bold uppercase tracking-wider text-slate-400 p-4">Quantity</th>
                <th className="text-left text-xs font-bold uppercase tracking-wider text-slate-400 p-4">From</th>
                <th className="text-left text-xs font-bold uppercase tracking-wider text-slate-400 p-4">To</th>
                <th className="text-left text-xs font-bold uppercase tracking-wider text-slate-400 p-4">Reference</th>
                <th className="text-left text-xs font-bold uppercase tracking-wider text-slate-400 p-4">Date</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((move, i) => (
                <motion.tr
                  key={move.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className="border-b border-white/5 hover:bg-white/5 transition"
                >
                  <td className="p-4">
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg border ${getTypeColor(move.type)}`}>
                      {getTypeIcon(move.type)}
                      <span className="text-xs font-bold">{move.type}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div>
                      <p className="font-bold text-sm">{move.item?.name}</p>
                      <p className="text-xs text-slate-500 font-mono">{move.item?.sku}</p>
                    </div>
                  </td>
                  <td className="p-4 font-bold">{move.quantity}</td>
                  <td className="p-4 text-sm text-slate-400">
                    {move.fromLocation?.code || '—'}
                  </td>
                  <td className="p-4 text-sm text-slate-400">
                    {move.toLocation?.code || '—'}
                  </td>
                  <td className="p-4 text-sm text-slate-400 font-mono">
                    {move.reference || '—'}
                  </td>
                  <td className="p-4 text-xs text-slate-500">
                    {new Date(move.createdAt).toLocaleString('en-ZA')}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {movements.length === 0 && (
          <div className="text-center py-20 text-slate-500">
            <p>No movements found. Record your first stock movement to see it here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
