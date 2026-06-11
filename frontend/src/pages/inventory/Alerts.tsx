import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Bell, CheckCircle, Package, TrendingDown } from 'lucide-react';
import { inventoryApi } from '../../lib/inventoryApi';

export default function Alerts() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAlerts(); }, []);

  const loadAlerts = async () => {
    try {
      const res = await inventoryApi.getAlerts();
      setAlerts(res.data);
    } catch (error) {
      console.error('Failed to load alerts', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: number) => {
    try {
      await inventoryApi.markAlertRead(id);
      setAlerts(alerts.map(a => a.id === id ? { ...a, isRead: true } : a));
    } catch (error) {
      console.error('Failed to mark alert as read', error);
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'LOW_STOCK': return <TrendingDown className="text-rose-400" size={20} />;
      case 'EXPIRY': return <AlertTriangle className="text-amber-400" size={20} />;
      default: return <Bell className="text-blue-400" size={20} />;
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'LOW_STOCK': return 'border-rose-500/30 bg-rose-500/5';
      case 'EXPIRY': return 'border-amber-500/30 bg-amber-500/5';
      default: return 'border-blue-500/30 bg-blue-500/5';
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white p-6 md:p-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black">Stock Alerts</h1>
          <p className="text-slate-400 text-sm">Stay ahead of inventory issues with real-time notifications.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 border border-rose-500/20 rounded-lg">
          <AlertTriangle className="text-rose-400" size={16} />
          <span className="text-sm font-bold text-rose-400">
            {alerts.filter(a => !a.isRead).length} Unread
          </span>
        </div>
      </div>

      {/* Alerts List */}
      <div className="space-y-3">
        {alerts.map((alert, i) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`border rounded-2xl p-5 ${getAlertColor(alert.type)} ${
              alert.isRead ? 'opacity-60' : ''
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-black/40 rounded-xl">
                {getAlertIcon(alert.type)}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-lg mb-1">{alert.type.replace('_', ' ')}</h3>
                    <p className="text-sm text-slate-300">{alert.message}</p>
                  </div>
                  {!alert.isRead && (
                    <button
                      onClick={() => markAsRead(alert.id)}
                      className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition"
                      title="Mark as read"
                    >
                      <CheckCircle size={16} />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                  <div className="flex items-center gap-1">
                    <Package size={12} />
                    <span>{alert.item?.name}</span>
                  </div>
                  <span>•</span>
                  <span>{new Date(alert.createdAt).toLocaleString('en-ZA')}</span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {alerts.length === 0 && (
        <div className="text-center py-20 text-slate-500">
          <CheckCircle className="mx-auto mb-4 opacity-20 text-emerald-400" size={48} />
          <p className="text-lg font-bold text-emerald-400">All clear!</p>
          <p>No alerts at the moment. Your inventory is healthy.</p>
        </div>
      )}
    </div>
  );
}
