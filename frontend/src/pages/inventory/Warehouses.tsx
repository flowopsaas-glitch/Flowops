import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Warehouse as WarehouseIcon, MapPin, Users, Package, Plus, Edit, Trash2 } from 'lucide-react';
import { inventoryApi } from '../../lib/inventoryApi';

export default function Warehouses() {
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadWarehouses(); }, []);

  const loadWarehouses = async () => {
    try {
      const res = await inventoryApi.getWarehouses();
      setWarehouses(res.data);
    } catch (error) {
      console.error('Failed to load warehouses', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#020617]">
        <motion.div 
          animate={{ rotate: 360 }} 
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-white p-6 md:p-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black">Warehouse Network</h1>
          <p className="text-slate-400 text-sm">Manage your storage facilities across South Africa.</p>
        </div>
        <button className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-blue-500/20">
          <Plus size={16} /> Add Warehouse
        </button>
      </div>

      {/* Warehouse Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {warehouses.map((wh, i) => (
          <motion.div
            key={wh.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:border-blue-500/30 transition-all group"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-blue-500/10 rounded-xl text-blue-400">
                <WarehouseIcon size={24} />
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition">
                  <Edit size={14} />
                </button>
                <button className="p-2 bg-slate-800 rounded-lg hover:bg-red-500/20 hover:text-red-400 transition">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <h3 className="text-xl font-bold mb-1">{wh.name}</h3>
            <p className="text-xs text-blue-400 font-mono mb-4">{wh.code}</p>

            <div className="space-y-3 mb-4">
              {wh.address && (
                <div className="flex items-start gap-2 text-xs text-slate-400">
                  <MapPin size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{wh.address}, {wh.city}, {wh.province}</span>
                </div>
              )}
              {wh.managerName && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Users size={14} />
                  <span>{wh.managerName}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Package size={14} />
                <span>Capacity: {wh.capacity?.toLocaleString() || 'N/A'} units</span>
              </div>
            </div>

            <div className="pt-4 border-t border-white/5 flex justify-between items-center">
              <span className="text-xs text-slate-500">
                {wh.locations?.length || 0} locations
              </span>
              <span className="text-xs font-bold text-blue-400 group-hover:translate-x-1 transition-transform">
                View Details →
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {warehouses.length === 0 && (
        <div className="text-center py-20 text-slate-500">
          <WarehouseIcon className="mx-auto mb-4 opacity-20" size={48} />
          <p>No warehouses yet. Create your first warehouse to get started.</p>
        </div>
      )}
    </div>
  );
}
